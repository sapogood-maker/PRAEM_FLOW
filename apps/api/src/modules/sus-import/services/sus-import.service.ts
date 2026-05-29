import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QueuePriority, QueueStatus, SusImportRowStatus, SusImportStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { UploadSusImportDto } from '../dto/upload-sus-import.dto';
import { ParsedSusRow, SusSpreadsheetParser } from '../parsers/sus-spreadsheet.parser';
import { SusImportRowValidator } from '../validators/sus-import-row.validator';
import { SusImportRowMapper } from '../mappers/sus-import-row.mapper';

type UploadFile = { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number };
type NormalizedSusRow = ReturnType<SusImportRowMapper['map']>;

export interface SyncCounters {
  created: number;
  updated: number;
  skipped: number;
  duplicates: number;
  errors: number;
  createdPatients: number;
  updatedPatients: number;
  createdHospitals: number;
  updatedHospitals: number;
  queueRecordsCreated: number;
  queueRecordsUpdated: number;
  demandsCreated: number;
  demandsUpdated: number;
}

@Injectable()
export class SusImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: SusSpreadsheetParser,
    private readonly validator: SusImportRowValidator,
    private readonly mapper: SusImportRowMapper,
  ) {}

  async upload(
    tenantId: string,
    userId: string | undefined,
    file: UploadFile | undefined,
    dto: UploadSusImportDto,
  ) {
    const parsedRows = await this.resolveInputRows(tenantId, file, dto);
    const fileHash = this.hashFile(file, parsedRows);
    const previousImport = await this.prisma.importHistory.findFirst({
      where: { tenantId, fileHash },
      orderBy: { importDate: 'desc' },
      select: { id: true, importDate: true },
    });
    const duplicateFileWarning = previousImport ? 'This file was previously imported.' : null;

    const createdImport = await this.prisma.susImport.create({
      data: {
        tenantId,
        uploadedByUserId: userId ?? null,
        sourceSystem: dto.sourceSystem?.trim() || 'SUS',
        fileName: file?.originalname ?? `reprocess:${dto.reprocessFromImportId}`,
        fileMimeType: file?.mimetype ?? null,
        fileSizeBytes: file?.size ?? null,
        status: SusImportStatus.UPLOADED,
        notes: dto.notes?.trim() || null,
        reprocessedFromImportId: dto.reprocessFromImportId ?? null,
        processingAttempts: 1,
        metadata: {
          fileHash,
          duplicateFileWarning,
          previousImportId: previousImport?.id ?? null,
          previousImportDate: previousImport?.importDate?.toISOString?.() ?? null,
        },
      },
      select: { id: true },
    });

    let validRows = 0;
    let invalidRows = 0;
    let duplicateRows = 0;
    let malformedRows = 0;
    let invalidDateRows = 0;
    const seenRowKeys = new Set<string>();
    const normalizedRows: Array<{
      normalized: ReturnType<SusImportRowMapper['map']>;
      validation: ReturnType<SusImportRowValidator['validate']>;
      rowHash: string;
      lineNumber: number;
      rawData: Record<string, string>;
    }> = [];

    const stagedRows: Prisma.SusImportRowCreateManyInput[] = parsedRows.map((row) => {
      const validation = this.validator.validate(row.rawData, {
        lineNumber: row.lineNumber,
        seenRowKeys,
      });
      const normalized = this.mapper.map(row.rawData);
      const rowHash = this.hashRow(row.rawData);

      if (validation.warnings.some((e) => e.includes('DUPLICATE_ROW'))) duplicateRows += 1;
      if (validation.errors.some((e) => e.includes('MALFORMED_ROW'))) malformedRows += 1;
      if (validation.warnings.some((e) => e.includes('INVALID_DATE'))) invalidDateRows += 1;
      if (validation.valid) validRows += 1;
      else invalidRows += 1;

      normalizedRows.push({ normalized, validation, rowHash, lineNumber: row.lineNumber, rawData: row.rawData });

      return {
        tenantId,
        importId: createdImport.id,
        lineNumber: row.lineNumber,
        rowHash,
        status: validation.valid ? SusImportRowStatus.VALID : SusImportRowStatus.INVALID,
        rawData: row.rawData as unknown as Prisma.InputJsonValue,
        normalizedData: normalized as unknown as Prisma.InputJsonValue,
        validationErrors: validation.errors as unknown as Prisma.InputJsonValue,
        validationWarnings: validation.warnings as unknown as Prisma.InputJsonValue,
      };
    });

    if (stagedRows.length > 0) {
      await this.prisma.susImportRow.createMany({ data: stagedRows });
    }

    const importStatus = invalidRows > 0 ? SusImportStatus.PREVIEW_READY : SusImportStatus.VALIDATED;
    await this.prisma.susImport.update({
      where: { id: createdImport.id },
      data: {
        totalRows: stagedRows.length,
        validRows,
        invalidRows,
        status: importStatus,
        metadata: {
          validationCompletedAt: new Date().toISOString(),
          canProcess: invalidRows === 0,
          duplicateRows,
          malformedRows,
          invalidDateRows,
          previewRequired: true,
          fileHash,
          duplicateFileWarning,
          previousImportId: previousImport?.id ?? null,
        },
      },
    });

    const processingResult = await this.applyOperationalChanges(
      tenantId,
      createdImport.id,
      normalizedRows.filter((row) => row.validation.valid).map((row) => row.normalized),
    );
    const finalStatus = validRows > 0 ? SusImportStatus.PROCESSED : importStatus;

    await this.prisma.importHistory.create({
      data: {
        tenantId,
        fileHash,
        recordsRead: stagedRows.length,
        recordsCreated: processingResult.created,
        recordsUpdated: processingResult.updated,
        duplicatesSkipped: processingResult.duplicates,
        errors: processingResult.errors,
      },
    });

    await this.prisma.susImport.update({
      where: { id: createdImport.id },
      data: {
        status: finalStatus,
        processedAt: validRows > 0 ? new Date() : null,
        metadata: {
          validationCompletedAt: new Date().toISOString(),
          processingCompletedAt: new Date().toISOString(),
          canProcess: invalidRows === 0,
          duplicateRows,
          malformedRows,
          invalidDateRows,
          previewRequired: false,
          processingResult: processingResult as unknown as Prisma.InputJsonValue,
          fileHash,
          duplicateFileWarning,
          previousImportId: previousImport?.id ?? null,
          suggestOperationalGrouping: { available: true },
        },
      },
    });

    return {
      id: createdImport.id,
      status: finalStatus,
      totalRows: stagedRows.length,
      validRows,
      invalidRows,
      previewAvailable: true,
      canProcess: invalidRows === 0,
      warning: duplicateFileWarning,
      processed: processingResult,
      summary: {
        created: processingResult.created,
        updated: processingResult.updated,
        skipped: processingResult.skipped,
        duplicates: processingResult.duplicates,
        errors: processingResult.errors,
      },
      importSummary: {
        createdPatients: processingResult.createdPatients,
        updatedPatients: processingResult.updatedPatients,
        createdHospitals: processingResult.createdHospitals,
        updatedHospitals: processingResult.updatedHospitals,
        queueRecordsCreated: processingResult.queueRecordsCreated,
        queueRecordsUpdated: processingResult.queueRecordsUpdated,
        duplicatesSkipped: processingResult.duplicates,
        errors: processingResult.errors,
      },
      preview: {
        endpoint: `/sus-import/${createdImport.id}/preview`,
        duplicateRows,
        malformedRows,
        invalidDateRows,
      },
    };
  }

  async history(tenantId: string, page = 1, limit = 20) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      this.prisma.susImport.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          sourceSystem: true,
          fileName: true,
          status: true,
          totalRows: true,
          validRows: true,
          invalidRows: true,
          processingAttempts: true,
          reprocessedFromImportId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.susImport.count({ where: { tenantId } }),
    ]);

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    };
  }

  async preview(tenantId: string, importId: string, page = 1, limit = 100) {
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100;
    const skip = (safePage - 1) * safeLimit;

    const importHeader = await this.prisma.susImport.findFirst({
      where: { id: importId, tenantId },
      select: {
        id: true,
        status: true,
        sourceSystem: true,
        fileName: true,
        totalRows: true,
        validRows: true,
        invalidRows: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!importHeader) throw new NotFoundException('SUS import not found');

    const [rows, totalRows] = await Promise.all([
      this.prisma.susImportRow.findMany({
        where: { tenantId, importId },
        orderBy: { lineNumber: 'asc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          lineNumber: true,
          status: true,
          rawData: true,
          normalizedData: true,
          validationErrors: true,
          validationWarnings: true,
          createdAt: true,
        },
      }),
      this.prisma.susImportRow.count({ where: { tenantId, importId } }),
    ]);

    return {
      import: importHeader,
      rows,
      pagination: {
        total: totalRows,
        page: safePage,
        limit: safeLimit,
        pages: Math.ceil(totalRows / safeLimit),
      },
    };
  }

  private async resolveInputRows(
    tenantId: string,
    file: UploadFile | undefined,
    dto: UploadSusImportDto,
  ): Promise<ParsedSusRow[]> {
    if (file?.buffer?.length) {
      return this.parser.parse({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      });
    }

    if (!dto.reprocessFromImportId) {
      throw new BadRequestException('file or reprocessFromImportId is required');
    }

    const source = await this.prisma.susImport.findFirst({
      where: { id: dto.reprocessFromImportId, tenantId },
      select: { id: true },
    });
    if (!source) {
      throw new NotFoundException('Source import for reprocessing not found');
    }

    const rows = await this.prisma.susImportRow.findMany({
      where: { tenantId, importId: source.id },
      orderBy: { lineNumber: 'asc' },
      select: { lineNumber: true, rawData: true },
    });
    if (rows.length === 0) {
      throw new BadRequestException('Source import has no staged rows to reprocess');
    }

    return rows.map((row) => ({
      lineNumber: row.lineNumber,
      rawData: (row.rawData ?? {}) as Record<string, string>,
    }));
  }

  private async applyOperationalChanges(tenantId: string, importId: string, rows: NormalizedSusRow[]): Promise<SyncCounters> {
    const counters: SyncCounters = {
      created: 0,
      updated: 0,
      skipped: 0,
      duplicates: 0,
      errors: 0,
      createdPatients: 0,
      updatedPatients: 0,
      createdHospitals: 0,
      updatedHospitals: 0,
      queueRecordsCreated: 0,
      queueRecordsUpdated: 0,
      demandsCreated: 0,
      demandsUpdated: 0,
    };
    if (rows.length === 0) return counters;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { city: true, state: true },
    });
    if (!tenant) throw new BadRequestException('Tenant not found');

    for (const row of rows) {
      try {
        const patient = await this.findOrCreatePatient(tenantId, row);
        if (patient.created) {
          counters.createdPatients += 1;
          counters.created += 1;
        } else if (patient.updated) {
          counters.updatedPatients += 1;
          counters.updated += 1;
        }

        const location = await this.findOrCreateLocation(tenantId, row, tenant.city, tenant.state);
        if (location.created) {
          counters.createdHospitals += 1;
          counters.created += 1;
        } else if (location.updated) {
          counters.updatedHospitals += 1;
          counters.updated += 1;
        }

        const demand = await this.findOrCreateDemand(tenantId, importId, patient.id, location.id, row);
        if (demand.created) {
          counters.demandsCreated += 1;
          counters.created += 1;
        } else if (demand.updated) {
          counters.demandsUpdated += 1;
          counters.updated += 1;
        }

        const queue = await this.findOrCreateQueue(tenantId, demand.id, patient.id, location.id, row);
        if (queue.created) {
          counters.queueRecordsCreated += 1;
          counters.created += 1;
        } else if (queue.updated) {
          counters.queueRecordsUpdated += 1;
          counters.updated += 1;
        } else {
          counters.duplicates += 1;
          counters.skipped += 1;
        }
      } catch {
        counters.errors += 1;
      }
    }

    return counters;
  }

  private async findOrCreatePatient(tenantId: string, row: NormalizedSusRow) {
    const birthDate = this.parseBirthDate(row.birth_date) ?? new Date('1970-01-01T00:00:00Z');
    let existing: {
      id: string;
      name: string;
      cpf: string;
      susCard: string | null;
      birthDate: Date;
      phone: string | null;
      address: string;
      notes: string | null;
      specialRequirements: string | null;
      emergencyContact: string | null;
      recurringPatient: boolean;
    } | null = null;

    if (row.sus_card) {
      existing = await this.prisma.patient.findFirst({
        where: { tenantId, susCard: row.sus_card },
        select: {
          id: true,
          name: true,
          cpf: true,
          susCard: true,
          birthDate: true,
          phone: true,
          address: true,
          notes: true,
          specialRequirements: true,
          emergencyContact: true,
          recurringPatient: true,
        },
      });
    }

    if (!existing && row.source_cpf_provided) {
      existing = await this.prisma.patient.findFirst({
        where: { tenantId, cpf: row.cpf },
        select: {
          id: true,
          name: true,
          cpf: true,
          susCard: true,
          birthDate: true,
          phone: true,
          address: true,
          notes: true,
          specialRequirements: true,
          emergencyContact: true,
          recurringPatient: true,
        },
      });
    }

    if (!existing) {
      const byBirthDate = await this.prisma.patient.findMany({
        where: { tenantId, birthDate },
        select: {
          id: true,
          name: true,
          cpf: true,
          susCard: true,
          birthDate: true,
          phone: true,
          address: true,
          notes: true,
          specialRequirements: true,
          emergencyContact: true,
          recurringPatient: true,
        },
      });
      existing = byBirthDate.find((p) => this.normalizeIdentity(p.name) === this.normalizeIdentity(row.patient_name)) ?? null;
    }

    if (!existing) {
      const created = await this.prisma.patient.create({
        data: {
          tenantId,
          name: row.patient_name || 'Paciente sem nome',
          cpf: row.cpf,
          susCard: row.sus_card ?? null,
          birthDate,
          phone: row.phone ?? null,
          address: row.destination_address || row.destination_hospital || 'Sem endereço informado',
          notes: row.notes ?? null,
          specialRequirements: row.special_requirements ?? null,
          emergencyContact: row.phone ?? null,
          recurringPatient: Boolean(row.return_trip),
          recurrent: Boolean(row.return_trip),
          mobility: this.inferMobility(row),
          clinicalRisk: this.mapRisk(row.priority),
        },
        select: { id: true },
      });
      return { id: created.id, created: true, updated: false };
    }

    const data: Prisma.PatientUpdateInput = {};
    if (!existing.susCard && row.sus_card) data.susCard = row.sus_card;
    if (!existing.phone && row.phone) data.phone = row.phone;
    if ((!existing.address || existing.address === 'Sem endereço informado') && (row.destination_address || row.destination_hospital)) {
      data.address = row.destination_address || row.destination_hospital;
    }
    if (!existing.notes && row.notes) data.notes = row.notes;
    if (!existing.specialRequirements && row.special_requirements) data.specialRequirements = row.special_requirements;
    if (!existing.emergencyContact && row.phone) data.emergencyContact = row.phone;
    if (!existing.recurringPatient && row.return_trip) {
      data.recurringPatient = true;
      data.recurrent = true;
    }
    if (row.source_cpf_provided && existing.cpf !== row.cpf) data.cpf = row.cpf;
    if (existing.birthDate.getTime() === new Date('1970-01-01T00:00:00Z').getTime() && birthDate) data.birthDate = birthDate;

    if (Object.keys(data).length === 0) return { id: existing.id, created: false, updated: false };

    await this.prisma.patient.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false, updated: true };
  }

  private async findOrCreateLocation(tenantId: string, row: NormalizedSusRow, fallbackCity: string, fallbackState: string) {
    const city = row.origin_city || fallbackCity;
    const existingCandidates = await this.prisma.healthcareLocation.findMany({
      where: {
        tenantId,
        city: { equals: city, mode: 'insensitive' },
      },
      select: {
        id: true,
        name: true,
        active: true,
        address: true,
      },
    });
    const existing = existingCandidates.find(
      (candidate) => this.normalizeIdentity(candidate.name) === this.normalizeIdentity(row.destination_hospital),
    );
    if (existing) {
      const data: Prisma.HealthcareLocationUpdateInput = {};
      if (!existing.active) data.active = true;
      if ((!existing.address || existing.address === existing.name) && row.destination_address) data.address = row.destination_address;
      if (Object.keys(data).length > 0) {
        await this.prisma.healthcareLocation.update({ where: { id: existing.id }, data });
        return { id: existing.id, created: false, updated: true };
      }
      return { id: existing.id, created: false, updated: false };
    }

    const created = await this.prisma.healthcareLocation.create({
      data: {
        tenantId,
        name: row.destination_hospital,
        type: 'HOSPITAL',
        city,
        state: fallbackState,
        address: row.destination_address || row.destination_hospital,
        active: true,
      },
      select: { id: true },
    });
    return { id: created.id, created: true, updated: false };
  }

  private async findOrCreateDemand(
    tenantId: string,
    importId: string,
    patientId: string,
    healthcareLocationId: string,
    row: NormalizedSusRow,
  ) {
    const appointmentDate = new Date(row.appointment_at);
    const existing = await this.prisma.operationalDemand.findUnique({
      where: {
        tenantId_patientId_healthcareLocationId_appointmentDate: {
          tenantId,
          patientId,
          healthcareLocationId,
          appointmentDate,
        },
      },
      select: {
        id: true,
        sourceImportId: true,
        notes: true,
        returnTrip: true,
        wheelchair: true,
        stretcher: true,
      },
    });
    if (!existing) {
      const created = await this.prisma.operationalDemand.create({
        data: {
          tenantId,
          sourceImportId: importId,
          patientId,
          healthcareLocationId,
          appointmentDate,
          priority: row.priority as QueuePriority,
          returnTrip: Boolean(row.return_trip),
          wheelchair: this.isWheelchair(row),
          stretcher: this.isStretcher(row),
          notes: row.notes ?? null,
        },
        select: { id: true },
      });
      return { id: created.id, created: true, updated: false };
    }

    const data: Prisma.OperationalDemandUpdateInput = {};
    if (!existing.sourceImportId) data.sourceImport = { connect: { id: importId } };
    if (!existing.notes && row.notes) data.notes = row.notes;
    if (!existing.returnTrip && row.return_trip) data.returnTrip = true;
    if (!existing.wheelchair && this.isWheelchair(row)) data.wheelchair = true;
    if (!existing.stretcher && this.isStretcher(row)) data.stretcher = true;
    if (Object.keys(data).length === 0) return { id: existing.id, created: false, updated: false };

    await this.prisma.operationalDemand.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false, updated: true };
  }

  private async findOrCreateQueue(
    tenantId: string,
    demandId: string,
    patientId: string,
    destinationId: string,
    row: NormalizedSusRow,
  ) {
    const appointmentDate = new Date(row.appointment_at);
    const existingCandidates = await this.prisma.operationalQueue.findMany({
      where: { tenantId, patientId, appointmentDate },
      select: { id: true, destination: true, healthcareLocationId: true, demandId: true, status: true, notes: true },
    });
    const existing = existingCandidates.find(
      (queue) => this.normalizeIdentity(queue.destination ?? '') === this.normalizeIdentity(row.destination_hospital),
    );
    if (!existing) {
      const created = await this.prisma.operationalQueue.create({
        data: {
          tenantId,
          demandId,
          patientId,
          healthcareLocationId: destinationId,
          destination: row.destination_hospital,
          appointmentDate,
          priority: row.priority as QueuePriority,
          queueType: 'LOGISTICS',
          status: QueueStatus.WAITING_DISPATCH,
          confirmationStatus: 'PENDING',
          notes: row.notes,
        },
        select: { id: true },
      });
      return { id: created.id, created: true, updated: false };
    }

    const data: Prisma.OperationalQueueUpdateInput = {};
    if (!existing.demandId) data.demand = { connect: { id: demandId } };
    if (!existing.healthcareLocationId) data.healthcareLocation = { connect: { id: destinationId } };
    if ((!existing.destination || existing.destination.trim().length === 0) && row.destination_hospital) data.destination = row.destination_hospital;
    if (!existing.notes && row.notes) data.notes = row.notes;
    if (
      String(existing.status).toUpperCase() === 'WAITING' ||
      String(existing.status).toUpperCase() === 'ASSIGNED' ||
      String(existing.status).toUpperCase() === 'SCHEDULED'
    ) {
      data.status = QueueStatus.WAITING_DISPATCH;
    }
    if (Object.keys(data).length === 0) return { id: existing.id, created: false, updated: false };

    await this.prisma.operationalQueue.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false, updated: true };
  }

  private hashRow(rawData: Record<string, string>): string {
    return createHash('sha256').update(JSON.stringify(rawData)).digest('hex');
  }

  private hashFile(file: UploadFile | undefined, parsedRows: ParsedSusRow[]): string {
    if (file?.buffer?.length) {
      return createHash('sha256').update(file.buffer).digest('hex');
    }
    return createHash('sha256').update(JSON.stringify(parsedRows)).digest('hex');
  }

  private normalizeIdentity(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private parseBirthDate(value: string | undefined): Date | null {
    if (!value) return null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (iso) {
      return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private inferMobility(row: NormalizedSusRow): 'NORMAL' | 'WHEELCHAIR' | 'STRETCHER' | 'OXYGEN' {
    if (this.isStretcher(row)) return 'STRETCHER';
    if (this.isWheelchair(row)) return 'WHEELCHAIR';
    return 'NORMAL';
  }

  private mapRisk(priority: QueuePriority): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (priority === 'EMERGENCY' || priority === 'CRITICAL') return 'CRITICAL';
    if (priority === 'HIGH') return 'HIGH';
    if (priority === 'NORMAL') return 'MEDIUM';
    return 'LOW';
  }

  private isWheelchair(row: NormalizedSusRow) {
    return this.normalizeIdentity(row.special_requirements ?? '').includes('cadeira de rodas');
  }

  private isStretcher(row: NormalizedSusRow) {
    const normalized = this.normalizeIdentity(row.special_requirements ?? '');
    return normalized.includes('maca') || normalized.includes('deitado');
  }
}
