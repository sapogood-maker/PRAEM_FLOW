import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, QueuePriority, QueueStatus, QueueType } from '@prisma/client';
import { createHash } from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { DispatchEngineService } from '../dispatch-engine/dispatch-engine.service';

type ImportMode = 'PREVIEW' | 'APPLY';
type DispatchType = 'SCHEDULED' | 'IMMEDIATE';

interface ImportOptions {
  mode: ImportMode;
  autoAssignVehicles: boolean;
  defaultDispatchType: DispatchType;
  defaultOrigin?: string;
  confirmDuplicateFile?: boolean;
}

interface NormalizedRow {
  rowNumber: number;
  patientName: string;
  cpf: string;
  susCard?: string;
  sourceCpfProvided: boolean;
  birthDate: Date;
  phone?: string;
  address: string;
  mobility: 'NORMAL' | 'WHEELCHAIR' | 'STRETCHER' | 'OXYGEN';
  clinicalRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresCompanion: boolean;
  companionName?: string;
  companionPhone?: string;
  specialRequirements?: string;
  appointmentDate: Date;
  destinationName: string;
  destinationCity?: string;
  destinationState?: string;
  destinationAddress?: string;
  destinationType:
    | 'HOSPITAL'
    | 'CLINIC'
    | 'LAB'
    | 'UBS'
    | 'SPECIALTY_CENTER'
    | 'HEMODIALYSIS'
    | 'ONCOLOGY_CENTER';
  priority: 'EMERGENCY' | 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'PENDING';
  queueType: QueueType;
  notes?: string;
  dispatchType: DispatchType;
  scheduledAt: Date;
  origin: string;
  preferredVehiclePlate?: string;
  returnTrip: boolean;
  wheelchair: boolean;
  stretcher: boolean;
}

interface ImportSummary {
  patientsCreated: number;
  patientsUpdated: number;
  hospitalsCreated: number;
  hospitalsUpdated: number;
  demandsCreated: number;
  demandsUpdated: number;
  queueRecordsCreated: number;
  queueRecordsUpdated: number;
  duplicatesSkipped: number;
  errors: number;
}

interface RouteGroupPlan {
  key: string;
  destination: string;
  dispatchType: DispatchType;
  scheduledAt: string;
  rowCount: number;
  preferredVehiclePlate: string | null;
}

interface ImportIntelligence {
  knownPatients: number;
  knownDestinations: number;
  recurringRouteMatches: number;
  futureHooks: string[];
}

@Injectable()
export class SchedulingImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchEngine: DispatchEngineService,
  ) {}

  async importSpreadsheet(
    tenantId: string,
    file: { buffer: Buffer; originalname?: string },
    options: ImportOptions,
  ) {
    const { rows, warnings } = this.parseRows(file);
    if (rows.length === 0) {
      throw new BadRequestException('No valid rows found in spreadsheet');
    }

    const fileHash = this.hashFile(file.buffer);
    const previousImport = await this.prisma.importHistory.findFirst({
      where: { tenantId, fileHash },
      orderBy: { importDate: 'desc' },
      select: { id: true, importDate: true },
    });
    const duplicateFileWarning = previousImport ? 'This file was previously imported.' : null;

    if (options.mode === 'PREVIEW') {
      const intelligence = await this.buildIntelligence(tenantId, rows);
      return {
        mode: 'PREVIEW',
        file: { name: file.originalname ?? null, hash: fileHash, rowCount: rows.length },
        warnings,
        warning: duplicateFileWarning,
        plan: this.buildGroupPlan(rows),
        intelligence,
        suggestOperationalGrouping: this.buildSuggestions(rows),
      };
    }

    if (previousImport && !options.confirmDuplicateFile) {
      throw new BadRequestException('This file was previously imported. Re-submit with confirmation to continue.');
    }

    const importHistoryEntry = await this.prisma.importHistory.create({
      data: {
        tenantId,
        fileHash,
        recordsRead: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        duplicatesSkipped: 0,
        errors: 0,
      },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { city: true, state: true },
    });
    if (!tenant) throw new BadRequestException('Tenant not found');

    const summary: ImportSummary = {
      patientsCreated: 0,
      patientsUpdated: 0,
      hospitalsCreated: 0,
      hospitalsUpdated: 0,
      demandsCreated: 0,
      demandsUpdated: 0,
      queueRecordsCreated: 0,
      queueRecordsUpdated: 0,
      duplicatesSkipped: 0,
      errors: 0,
    };

    for (const row of rows) {
      try {
        const patient = await this.upsertPatient(tenantId, row);
        if (patient.created) summary.patientsCreated += 1;
        else if (patient.updated) summary.patientsUpdated += 1;

        const location = await this.upsertHealthcareLocation(tenantId, row, tenant.city, tenant.state);
        if (location.created) summary.hospitalsCreated += 1;
        else if (location.updated) summary.hospitalsUpdated += 1;

        const demand = await this.upsertOperationalDemand(tenantId, patient.id, location.id, row);
        if (demand.created) summary.demandsCreated += 1;
        else if (demand.updated) summary.demandsUpdated += 1;

        const queue = await this.upsertOperationalQueue(tenantId, patient.id, location.id, demand.id, row);
        if (queue.created) summary.queueRecordsCreated += 1;
        else if (queue.updated) summary.queueRecordsUpdated += 1;

        if (!patient.created && !patient.updated && !location.created && !location.updated && !demand.created && !demand.updated && !queue.created && !queue.updated) {
          summary.duplicatesSkipped += 1;
        }
      } catch {
        summary.errors += 1;
      }
    }

    await this.prisma.importHistory.update({
      where: { id: importHistoryEntry.id },
      data: {
        recordsRead: rows.length,
        recordsCreated:
          summary.patientsCreated +
          summary.hospitalsCreated +
          summary.demandsCreated +
          summary.queueRecordsCreated,
        recordsUpdated:
          summary.patientsUpdated +
          summary.hospitalsUpdated +
          summary.demandsUpdated +
          summary.queueRecordsUpdated,
        duplicatesSkipped: summary.duplicatesSkipped,
        errors: summary.errors,
      },
    });

    const intelligence = await this.buildIntelligence(tenantId, rows);

    return {
      mode: 'APPLY',
      file: { name: file.originalname ?? null, hash: fileHash, rowCount: rows.length },
      warnings,
      warning: duplicateFileWarning,
      summary,
      intelligence,
      suggestOperationalGrouping: this.buildSuggestions(rows),
      importSummary: summary,
    };
  }

  private parseRows(file: { buffer: Buffer; originalname?: string }): { rows: NormalizedRow[]; warnings: string[] } {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true, raw: false });
    } catch {
      throw new BadRequestException('Unable to parse spreadsheet. Use CSV or XLSX format.');
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new BadRequestException('Spreadsheet has no sheets');

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

    const rows: NormalizedRow[] = [];
    const warnings: string[] = [];

    rawRows.forEach((raw, index) => {
      const row = this.normalizeRow(raw, index + 2);
      if (!row) {
        warnings.push(`Line ${index + 2}: skipped (required: patient name and destination)`);
        return;
      }
      rows.push(row);
    });

    return { rows, warnings };
  }

  private normalizeRow(raw: Record<string, unknown>, rowNumber: number): NormalizedRow | null {
    const map = new Map<string, unknown>();
    for (const [key, value] of Object.entries(raw)) {
      map.set(this.normalizeHeader(key), value);
    }

    const value = (...keys: string[]) => {
      for (const key of keys) {
        const hit = map.get(this.normalizeHeader(key));
        if (hit !== undefined && String(hit).trim() !== '') return hit;
      }
      return '';
    };

    const patientName = this.normalizeText(value('patientName', 'patient', 'nomePaciente', 'nome', 'paciente', 'usuario', 'beneficiario'));
    const cpfRaw = this.sanitizeCpf(String(value('cpf', 'documento', 'patientCpf')));
    const susCardRaw = this.sanitizeCpf(String(value('susCard', 'cartaoSus', 'sus', 'cns')));
    const sourceCpfProvided = cpfRaw.length === 11;
    const sourceSusCardProvided = susCardRaw.length > 0;
    const destinationName = this.normalizeText(
      value('destination', 'destino', 'hospital', 'clinica', 'clínica', 'unidade', 'healthcareLocation'),
    );

    if (!patientName || !destinationName) {
      return null;
    }

    const phone = this.normalizeText(value('phone', 'telefone', 'celular', 'contato')) || undefined;
    const destinationAddress = this.normalizeText(
      value('destinationAddress', 'enderecoDestino', 'hospitalEndereco', 'enderecoHospital', 'endereco', 'logradouro'),
    );
    const birthDate = this.parseDate(value('birthDate', 'dataNascimento', 'nascimento')) ?? new Date('1970-01-01T00:00:00Z');
    const appointmentDateRaw = value('appointmentDate', 'dataConsulta', 'appointment', 'scheduledAt', 'data', 'dia', 'date');
    const appointmentBaseDate = this.parseDate(appointmentDateRaw) ?? new Date();
    const scheduledAt = this.applyTime(appointmentBaseDate, value('appointmentTime', 'horaConsulta', 'hora', 'horario', 'time'));
    const defaultDispatchType = scheduledAt.getTime() > Date.now() ? 'SCHEDULED' : 'IMMEDIATE';
    const cpf = sourceCpfProvided
      ? cpfRaw
      : this.buildSyntheticCpf(
          `${this.normalizeHeader(patientName)}|${this.normalizeHeader(phone ?? '')}|${this.normalizeHeader(destinationName)}|${scheduledAt.toISOString().slice(0, 10)}`,
        );
    const specialRequirements = this.normalizeText(value('specialRequirements', 'necessidades', 'observacoes', 'observações')) || undefined;
    const wheelchair = this.normalizeIdentity(specialRequirements ?? '').includes('CADEIRA DE RODAS');
    const stretcher = this.normalizeIdentity(specialRequirements ?? '').includes('MACA') || this.normalizeIdentity(specialRequirements ?? '').includes('DEITADO');

    return {
      rowNumber,
      patientName,
      cpf,
      susCard: sourceSusCardProvided ? susCardRaw : undefined,
      sourceCpfProvided,
      birthDate,
      phone,
      address: this.normalizeText(value('address', 'patientAddress', 'enderecoPaciente')) || destinationAddress || 'Sem endereço informado',
      mobility: this.enumValue(value('mobility', 'mobilidade'), ['NORMAL', 'WHEELCHAIR', 'STRETCHER', 'OXYGEN'] as const, 'NORMAL'),
      clinicalRisk: this.enumValue(value('clinicalRisk', 'risk', 'riscoClinico'), ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const, 'LOW'),
      requiresCompanion: this.toBoolean(value('requiresCompanion', 'acompanhante', 'needsCompanion')),
      companionName: this.normalizeText(value('companionName', 'nomeAcompanhante')) || undefined,
      companionPhone: this.normalizeText(value('companionPhone', 'telefoneAcompanhante')) || undefined,
      specialRequirements,
      appointmentDate: scheduledAt,
      destinationName,
      destinationCity: this.normalizeText(value('destinationCity', 'cidadeDestino', 'cidade')) || undefined,
      destinationState: this.normalizeText(value('destinationState', 'estadoDestino', 'uf')) || undefined,
      destinationAddress: destinationAddress || undefined,
      destinationType: this.enumValue(
        value('destinationType', 'tipoDestino', 'locationType'),
        ['HOSPITAL', 'CLINIC', 'LAB', 'UBS', 'SPECIALTY_CENTER', 'HEMODIALYSIS', 'ONCOLOGY_CENTER'] as const,
        this.inferDestinationType(destinationName),
      ),
      priority: this.enumValue(value('priority', 'prioridade'), ['EMERGENCY', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'PENDING'] as const, 'NORMAL'),
      queueType: this.enumValue(value('queueType', 'tipoFila'), ['MEDICAL', 'LOGISTICS'] as const, 'LOGISTICS'),
      notes: this.normalizeText(value('notes', 'observacoes', 'observações')) || undefined,
      dispatchType: this.enumValue(value('dispatchType', 'tipoDespacho'), ['SCHEDULED', 'IMMEDIATE'] as const, defaultDispatchType),
      scheduledAt: this.applyTime(this.parseDate(value('dispatchAt', 'scheduledAt', 'horarioDespacho')) ?? appointmentBaseDate, value('dispatchTime', 'horaDespacho')),
      origin: this.normalizeText(value('origin', 'origem', 'cidadeOrigem', 'municipioOrigem')) || 'Central PRAEM OPS',
      preferredVehiclePlate: this.normalizeText(value('vehiclePlate', 'placaVeiculo')) || undefined,
      returnTrip: this.toBoolean(value('returnTrip', 'retorno', 'volta')),
      wheelchair,
      stretcher,
    };
  }

  private async upsertPatient(tenantId: string, row: NormalizedRow) {
    const birthDate = row.birthDate ?? new Date('1970-01-01T00:00:00Z');
    const existing = await this.findExistingPatient(tenantId, row, birthDate);

    if (!existing) {
      const created = await this.prisma.patient.create({
        data: {
          tenantId,
          name: row.patientName || 'Paciente sem nome',
          cpf: row.cpf,
          susCard: null,
          birthDate,
          phone: row.phone ?? null,
          address: row.address,
          lat: null,
          lng: null,
          mobility: row.mobility,
          clinicalRisk: row.clinicalRisk,
          recurrent: row.returnTrip,
          recurringPatient: row.returnTrip,
          notes: row.notes ?? null,
          praemId: null,
          qrHash: null,
          qrCodeUrl: null,
          qrCode: null,
          operationalId: null,
          lastTransportDate: null,
          specialRequirements: row.specialRequirements ?? null,
          emergencyContact: row.phone ?? null,
          qrToken: null,
          qrIssuedAt: null,
          qrActive: false,
          qrVersion: 1,
          requiresCompanion: row.requiresCompanion,
          companionName: row.companionName ?? null,
          companionPhone: row.companionPhone ?? null,
        },
        select: { id: true },
      });

      return { id: created.id, created: true, updated: false };
    }

    const data: Prisma.PatientUpdateInput = {};
    if (!existing.susCard && row.susCard) data.susCard = row.susCard;
    if (!existing.cpf && row.cpf) data.cpf = row.cpf;
    if (!existing.phone && row.phone) data.phone = row.phone;
    if ((!existing.address || existing.address === 'Sem endereço informado') && row.address) data.address = row.address;
    if (!existing.notes && row.notes) data.notes = row.notes;
    if (!existing.specialRequirements && row.specialRequirements) data.specialRequirements = row.specialRequirements;
    if (!existing.emergencyContact && row.phone) data.emergencyContact = row.phone;
    if (!existing.recurringPatient && row.returnTrip) {
      data.recurringPatient = true;
      data.recurrent = true;
    }
    if (existing.birthDate.getTime() === new Date('1970-01-01T00:00:00Z').getTime() && birthDate) {
      data.birthDate = birthDate;
    }
    if (!existing.requiresCompanion && row.requiresCompanion) data.requiresCompanion = true;
    if (!existing.companionName && row.companionName) data.companionName = row.companionName;
    if (!existing.companionPhone && row.companionPhone) data.companionPhone = row.companionPhone;

    if (Object.keys(data).length === 0) {
      return { id: existing.id, created: false, updated: false };
    }

    await this.prisma.patient.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false, updated: true };
  }

  private async upsertHealthcareLocation(tenantId: string, row: NormalizedRow, fallbackCity: string, fallbackState: string) {
    const city = row.destinationCity || fallbackCity;
    const normalizedName = this.normalizeLocationName(row.destinationName);
    const existingCandidates = await this.prisma.healthcareLocation.findMany({
      where: {
        tenantId,
        city: { equals: city, mode: 'insensitive' },
      },
      select: { id: true, name: true, active: true, address: true, city: true, state: true },
    });
    const existing = existingCandidates.find((candidate) => this.normalizeLocationName(candidate.name) === normalizedName);

    if (!existing) {
      const created = await this.prisma.healthcareLocation.create({
        data: {
          tenantId,
          name: row.destinationName.trim(),
          type: row.destinationType as any,
          city,
          state: row.destinationState || fallbackState,
          address: row.destinationAddress || row.destinationName.trim(),
          active: true,
        },
        select: { id: true },
      });
      return { id: created.id, created: true, updated: false };
    }

    const data: Prisma.HealthcareLocationUpdateInput = {};
    if (!existing.active) data.active = true;
    if ((!existing.address || this.normalizeLocationName(existing.address) === this.normalizeLocationName(existing.name)) && row.destinationAddress) {
      data.address = row.destinationAddress;
    }
    if (Object.keys(data).length === 0) {
      return { id: existing.id, created: false, updated: false };
    }

    await this.prisma.healthcareLocation.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false, updated: true };
  }

  private async upsertOperationalDemand(tenantId: string, patientId: string, healthcareLocationId: string, row: NormalizedRow) {
    const appointmentDate = row.appointmentDate;
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
          patientId,
          healthcareLocationId,
          appointmentDate,
          priority: row.priority as QueuePriority,
          returnTrip: row.returnTrip,
          wheelchair: row.wheelchair,
          stretcher: row.stretcher,
          notes: row.notes ?? null,
        },
        select: { id: true },
      });
      return { id: created.id, created: true, updated: false };
    }

    const data: Prisma.OperationalDemandUpdateInput = {};
    if (!existing.notes && row.notes) data.notes = row.notes;
    if (!existing.returnTrip && row.returnTrip) data.returnTrip = true;
    if (!existing.wheelchair && row.wheelchair) data.wheelchair = true;
    if (!existing.stretcher && row.stretcher) data.stretcher = true;
    if (Object.keys(data).length === 0) {
      return { id: existing.id, created: false, updated: false };
    }

    await this.prisma.operationalDemand.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false, updated: true };
  }

  private async upsertOperationalQueue(
    tenantId: string,
    patientId: string,
    healthcareLocationId: string,
    demandId: string,
    row: NormalizedRow,
  ) {
    const appointmentDate = row.appointmentDate;
    const existing = await this.prisma.operationalQueue.findFirst({
      where: {
        tenantId,
        patientId,
        healthcareLocationId,
        appointmentDate,
      },
      select: {
        id: true,
        demandId: true,
        healthcareLocationId: true,
        destination: true,
        status: true,
        notes: true,
        priority: true,
      },
    });

    if (!existing) {
      const created = await this.prisma.operationalQueue.create({
        data: {
          tenantId,
          operationId: null,
          demandId,
          patientId,
          appointmentDate,
          destination: row.destinationName,
          healthcareLocationId,
          lat: null,
          lng: null,
          priority: row.priority as QueuePriority,
          status: QueueStatus.WAITING_DISPATCH,
          queueType: row.queueType ?? QueueType.LOGISTICS,
          notes: row.notes ?? null,
          confirmationStatus: 'PENDING',
        },
        select: { id: true },
      });
      return { id: created.id, created: true, updated: false };
    }

    const data: Prisma.OperationalQueueUpdateInput = {};
    if (!existing.demandId) data.demand = { connect: { id: demandId } };
    if (!existing.healthcareLocationId) data.healthcareLocation = { connect: { id: healthcareLocationId } };
    if (!existing.destination && row.destinationName) data.destination = row.destinationName;
    if (!existing.notes && row.notes) data.notes = row.notes;
    if (this.canResetQueueStatus(existing.status)) {
      data.status = QueueStatus.WAITING_DISPATCH;
    }

    if (Object.keys(data).length === 0) {
      return { id: existing.id, created: false, updated: false };
    }

    await this.prisma.operationalQueue.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false, updated: true };
  }

  private async findExistingPatient(tenantId: string, row: NormalizedRow, birthDate: Date) {
    if (row.susCard) {
      const bySusCard = await this.prisma.patient.findFirst({
        where: { tenantId, susCard: row.susCard },
        select: this.patientSelect(),
      });
      if (bySusCard) return bySusCard;
    }

    const byCpf = await this.prisma.patient.findFirst({
      where: { tenantId, cpf: row.cpf },
      select: this.patientSelect(),
    });
    if (byCpf) return byCpf;

    const byBirthDate = await this.prisma.patient.findMany({
      where: { tenantId, birthDate },
      select: this.patientSelect(),
    });
    return byBirthDate.find((patient) => this.normalizeIdentity(patient.name) === this.normalizeIdentity(row.patientName)) ?? null;
  }

  private patientSelect() {
    return {
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
      recurrent: true,
      requiresCompanion: true,
      companionName: true,
      companionPhone: true,
    } as const;
  }

  private buildSuggestions(rows: NormalizedRow[]) {
    return this.dispatchEngine.suggestOperationalGrouping({
      demands: rows.map((row, index) => ({
        demandId: `row-${index + 1}`,
        destination: row.destinationName,
        appointmentTime: row.appointmentDate.toISOString(),
        priority: this.toPatientPriority(row.priority),
        wheelchair: row.wheelchair,
        stretcher: row.stretcher,
        returnTrip: row.returnTrip,
      })),
      vehicleCapacity: 4,
    });
  }

  private async buildIntelligence(tenantId: string, rows: NormalizedRow[]): Promise<ImportIntelligence> {
    const patientKeys = new Set(rows.map((row) => this.normalizeIdentity(row.patientName)));
    const destinationKeys = new Set(rows.map((row) => this.normalizeLocationName(row.destinationName)));

    const [knownPatients, knownDestinations, recurringRouteMatches] = await Promise.all([
      this.prisma.patient.count({
        where: {
          tenantId,
          OR: rows.flatMap((row) => {
            const clauses: Prisma.PatientWhereInput[] = [{ cpf: row.cpf }];
            if (row.susCard) clauses.push({ susCard: row.susCard });
            return clauses;
          }),
        },
      }),
      this.prisma.healthcareLocation.count({
        where: {
          tenantId,
          OR: rows.map((row) => ({
            city: row.destinationCity ?? undefined,
            name: { contains: row.destinationName, mode: 'insensitive' },
          })),
        },
      }),
      Promise.resolve([...new Set(rows.map((row) => `${this.normalizeLocationName(row.destinationName)}|${row.scheduledAt.toISOString().slice(0, 16)}`))].length),
    ]);

    return {
      knownPatients,
      knownDestinations,
      recurringRouteMatches,
      futureHooks: [
        'Dispatch module will create routes, trips, driver assignments, vehicles, QR codes, and notifications.',
        'Import only records demand and queue state.',
      ],
    };
  }

  private buildGroupPlan(rows: NormalizedRow[]): RouteGroupPlan[] {
    const map = new Map<string, RouteGroupPlan>();
    for (const row of rows) {
      const key = `${this.normalizeLocationName(row.destinationName)}|${row.dispatchType}|${row.scheduledAt.toISOString().slice(0, 16)}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          destination: row.destinationName,
          dispatchType: row.dispatchType,
          scheduledAt: row.scheduledAt.toISOString(),
          rowCount: 1,
          preferredVehiclePlate: row.preferredVehiclePlate ?? null,
        });
      } else {
        existing.rowCount += 1;
      }
    }
    return [...map.values()];
  }

  private canResetQueueStatus(status: unknown) {
    const normalized = String(status ?? '').toUpperCase();
    return ['WAITING', 'ASSIGNED', 'SCHEDULED'].includes(normalized);
  }

  private normalizeHeader(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .trim();
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim().replace(/\s{2,}/g, ' ');
  }

  private normalizeIdentity(value: string): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private normalizeLocationName(value: string): string {
    return this.normalizeIdentity(value);
  }

  private sanitizeCpf(value: string): string {
    return String(value ?? '').replace(/\D/g, '');
  }

  private buildSyntheticCpf(seed: string): string {
    const hash = createHash('sha256').update(seed).digest('hex');
    const digits = hash.replace(/[a-f]/gi, '').padEnd(10, '0').slice(0, 10);
    return `9${digits}`;
  }

  private hashFile(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private parseDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = this.normalizeText(value);
    if (!text) return null;
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00Z`);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private applyTime(date: Date, timeRaw: unknown): Date {
    const out = new Date(date);
    const text = this.normalizeText(timeRaw);
    const hhmm = /^([01]?\d|2[0-3])[:h]([0-5]\d)$/.exec(text);
    if (hhmm) {
      out.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0);
      return out;
    }
    out.setHours(8, 0, 0, 0);
    return out;
  }

  private toBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'sim', 's'].includes(normalized);
  }

  private enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
    const normalized = String(value ?? '').trim().toUpperCase();
    return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : fallback;
  }

  private inferDestinationType(destinationName: string): NormalizedRow['destinationType'] {
    const normalized = this.normalizeHeader(destinationName);
    if (normalized.includes('hemodialise')) return 'HEMODIALYSIS';
    if (normalized.includes('oncolog')) return 'ONCOLOGY_CENTER';
    if (normalized.includes('ubs')) return 'UBS';
    if (normalized.includes('laborat') || normalized.includes('lab')) return 'LAB';
    if (normalized.includes('clinica')) return 'CLINIC';
    return 'HOSPITAL';
  }

  private toPatientPriority(priority: NormalizedRow['priority']) {
    if (priority === 'EMERGENCY') return 'EMERGENCY';
    if (priority === 'CRITICAL') return 'CRITICAL';
    if (priority === 'HIGH') return 'HIGH';
    if (priority === 'NORMAL') return 'NORMAL';
    return 'LOW';
  }
}
