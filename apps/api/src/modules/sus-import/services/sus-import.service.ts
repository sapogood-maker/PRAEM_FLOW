import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, QueueStatus, SusImportRowStatus, SusImportStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { PatientsService } from '../../patients/patients.service';
import { OperationEventsService } from '../../operation-events/operation-events.service';
import { UploadSusImportDto } from '../dto/upload-sus-import.dto';
import { ParsedSusRow, SusSpreadsheetParser } from '../parsers/sus-spreadsheet.parser';
import { SusImportRowValidator } from '../validators/sus-import-row.validator';
import { SusImportRowMapper } from '../mappers/sus-import-row.mapper';

type UploadFile = { buffer?: Buffer; originalname?: string; mimetype?: string; size?: number };

@Injectable()
export class SusImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly parser: SusSpreadsheetParser,
    private readonly validator: SusImportRowValidator,
    private readonly mapper: SusImportRowMapper,
    private readonly operationEvents: OperationEventsService,
  ) {}

  async upload(
    tenantId: string,
    userId: string | undefined,
    file: UploadFile | undefined,
    dto: UploadSusImportDto,
  ) {
    const parsedRows = await this.resolveInputRows(tenantId, file, dto);

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
      },
      select: { id: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const operation = await this.prisma.operation.upsert({
      where: { tenantId_date: { tenantId, date: today } },
      create: {
        tenantId,
        date: today,
        status: 'IMPORTED' as any,
        createdAutomatically: false,
        totalPatients: parsedRows.length,
      },
      update: {
        totalPatients: { increment: parsedRows.length },
      },
    });
    await this.operationEvents.record({
      tenantId,
      operationId: operation.id,
      eventType: 'SUS_IMPORT_UPLOADED',
      actorType: userId ? 'USER' : 'IMPORT',
      actorId: userId ?? null,
      metadata: {
        sourceSystem: dto.sourceSystem?.trim() || 'SUS',
        fileName: file?.originalname ?? null,
        rowCount: parsedRows.length,
        reprocessFromImportId: dto.reprocessFromImportId ?? null,
      },
    });

    let validRows = 0;
    let invalidRows = 0;
    let duplicateRows = 0;
    let malformedRows = 0;
    let invalidDateRows = 0;
    const seenRowKeys = new Set<string>();
    const normalizedRows: Array<{
      lineNumber: number;
      rawData: Record<string, string>;
      normalized: ReturnType<SusImportRowMapper['map']>;
      validation: ReturnType<SusImportRowValidator['validate']>;
      rowHash: string;
    }> = [];

    const stagedRows: Prisma.SusImportRowCreateManyInput[] = parsedRows.map((row) => {
      const validation = this.validator.validate(row.rawData, {
        lineNumber: row.lineNumber,
        seenRowKeys,
      });
      const normalized = this.mapper.map(row.rawData);
      const rowHash = this.hashRow(row.rawData);

      if (validation.errors.some((e) => e.includes('DUPLICATE_ROW'))) duplicateRows += 1;
      if (validation.errors.some((e) => e.includes('MALFORMED_ROW'))) malformedRows += 1;
      if (validation.errors.some((e) => e.includes('INVALID_DATE'))) invalidDateRows += 1;

      if (validation.valid) validRows += 1;
      else invalidRows += 1;

      normalizedRows.push({ lineNumber: row.lineNumber, rawData: row.rawData, normalized, validation, rowHash });

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
        },
      },
    });

    const processingResult = await this.applyOperationalChanges(tenantId, normalizedRows.filter((row) => row.validation.valid).map((row) => row.normalized));
    const finalStatus = validRows > 0 ? SusImportStatus.PROCESSED : importStatus;

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
          processingResult,
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
      processed: processingResult,
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

  private async applyOperationalChanges(
    tenantId: string,
    rows: Array<ReturnType<SusImportRowMapper['map']>>,
  ) {
    if (rows.length === 0) {
      return { createdPatients: 0, reusedPatients: 0, createdQueues: 0, reusedQueues: 0, createdRoutes: 0, createdTrips: 0 };
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { city: true, state: true },
    });
    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const groups = new Map<string, Array<{ row: ReturnType<SusImportRowMapper['map']>; patientId: string; queueId: string; destinationId: string }>>();
    let createdPatients = 0;
    let reusedPatients = 0;
    let createdQueues = 0;
    let reusedQueues = 0;

    for (const row of rows) {
      const patient = await this.patientsService.upsertFromSusImport(tenantId, {
        name: row.patient_name,
        cpf: row.cpf,
        phone: row.phone,
        address: row.destination_address || row.destination_hospital,
        notes: row.notes,
        specialRequirements: row.special_requirements,
        emergencyContact: row.phone,
        recurringPatient: row.return_trip,
      });

      if ((patient as any)._created) createdPatients += 1;
      else reusedPatients += 1;

      const destination = await this.findOrCreateDestination(tenantId, row, tenant.city, tenant.state);
      const queue = await this.findOrCreateQueue(tenantId, patient.id, destination.id, row);
      if (queue.created) createdQueues += 1;
      else reusedQueues += 1;

      const key = this.groupKey(row, destination.id);
      const items = groups.get(key) ?? [];
      items.push({ row, patientId: patient.id, queueId: queue.id, destinationId: destination.id });
      groups.set(key, items);
    }

    const routeResults: Array<{ routeId: string; destination: string; tripCount: number }> = [];
    let createdRoutes = 0;
    let createdTrips = 0;

    for (const [, items] of groups) {
      const first = items[0];
      const routeDate = new Date(first.row.appointment_at);
      const dispatchType = routeDate.getTime() > Date.now() ? 'SCHEDULED' : 'IMMEDIATE';
      const route = await this.findOrCreateRoute(tenantId, first.row, first.destinationId, routeDate, dispatchType);
      if (route.created) createdRoutes += 1;

      for (const item of items) {
        const trip = await this.findOrCreateTrip(tenantId, route.id, item.patientId, item.row);
        if (trip.created) createdTrips += 1;
        await this.prisma.operationalQueue.update({
          where: { id: item.queueId },
          data: { status: dispatchType === 'SCHEDULED' ? QueueStatus.SCHEDULED : QueueStatus.ASSIGNED },
        });
      }

      routeResults.push({ routeId: route.id, destination: first.row.destination_hospital, tripCount: items.length });
    }

    return { createdPatients, reusedPatients, createdQueues, reusedQueues, createdRoutes, createdTrips, routes: routeResults };
  }

  private hashRow(rawData: Record<string, string>): string {
    return createHash('sha256').update(JSON.stringify(rawData)).digest('hex');
  }

  private groupKey(row: ReturnType<SusImportRowMapper['map']>, destinationId: string) {
    const minuteKey = row.appointment_at.slice(0, 16);
    return `${destinationId}|${minuteKey}`;
  }

  private async findOrCreateDestination(
    tenantId: string,
    row: ReturnType<SusImportRowMapper['map']>,
    fallbackCity: string,
    fallbackState: string,
  ) {
    const existing = await this.prisma.healthcareLocation.findFirst({
      where: {
        tenantId,
        active: true,
        name: { equals: row.destination_hospital, mode: 'insensitive' },
        city: { equals: row.origin_city || fallbackCity, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    if (existing) return existing;

    return this.prisma.healthcareLocation.create({
      data: {
        tenantId,
        name: row.destination_hospital,
        type: 'HOSPITAL',
        city: fallbackCity,
        state: fallbackState,
        address: row.destination_address || row.destination_hospital,
        active: true,
      },
      select: { id: true, name: true },
    });
  }

  private async findOrCreateQueue(
    tenantId: string,
    patientId: string,
    destinationId: string,
    row: ReturnType<SusImportRowMapper['map']>,
  ) {
    const appointmentDate = new Date(row.appointment_at);
    const existing = await this.prisma.operationalQueue.findFirst({
      where: {
        tenantId,
        patientId,
        healthcareLocationId: destinationId,
        appointmentDate,
        status: { in: [QueueStatus.WAITING, QueueStatus.CONFIRMED, QueueStatus.ASSIGNED, QueueStatus.SCHEDULED] },
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    const created = await this.prisma.operationalQueue.create({
      data: {
        tenantId,
        patientId,
        healthcareLocationId: destinationId,
        destination: row.destination_hospital,
        appointmentDate,
        priority: row.priority,
        queueType: 'LOGISTICS',
        status: 'WAITING',
        confirmationStatus: 'PENDING',
        notes: row.notes,
      },
    });
    return { id: created.id, created: true };
  }

  private async findOrCreateRoute(
    tenantId: string,
    row: ReturnType<SusImportRowMapper['map']>,
    destinationId: string,
    routeDate: Date,
    dispatchType: 'SCHEDULED' | 'IMMEDIATE',
  ) {
    const existing = await this.prisma.route.findFirst({
      where: {
        tenantId,
        destination: row.destination_hospital,
        date: routeDate,
        dispatchType,
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    const created = await this.prisma.route.create({
      data: {
        tenantId,
        origin: row.origin_city || 'Central PRAEM OPS',
        destination: row.destination_hospital,
        date: routeDate,
        scheduledAt: dispatchType === 'SCHEDULED' ? routeDate : null,
        dispatchType,
        status: dispatchType === 'SCHEDULED' ? 'SCHEDULED' : 'PLANNED',
        waypoints: { destinationId, source: 'sus-import' },
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  }

  private async findOrCreateTrip(
    tenantId: string,
    routeId: string,
    patientId: string,
    row: ReturnType<SusImportRowMapper['map']>,
  ) {
    const existing = await this.prisma.trip.findFirst({
      where: { tenantId, routeId, patientId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };

    const created = await this.prisma.trip.create({
      data: {
        tenantId,
        routeId,
        patientId,
        status: 'SCHEDULED',
        notes: row.notes ?? null,
      },
      select: { id: true },
    });
    return { id: created.id, created: true };
  }
}
