import { BadRequestException, Injectable } from '@nestjs/common';
import { QueueStatus, QueueType } from '@prisma/client';
import { createHash } from 'crypto';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { QueuesService } from '../queues/queues.service';
import { RoutesService } from '../routes/routes.service';
import { TripsService } from '../trips/trips.service';
import { OperationEventsService } from '../operation-events/operation-events.service';

type ImportMode = 'PREVIEW' | 'APPLY';
type DispatchType = 'SCHEDULED' | 'IMMEDIATE';

interface ImportOptions {
  mode: ImportMode;
  autoAssignVehicles: boolean;
  defaultDispatchType: DispatchType;
  defaultOrigin?: string;
}

interface NormalizedRow {
  rowNumber: number;
  patientName: string;
  cpf: string;
  sourceCpfProvided: boolean;
  birthDate: Date;
  phone?: string;
  address: string;
  mobility: 'NORMAL' | 'WHEELCHAIR' | 'STRETCHER' | 'OXYGEN';
  clinicalRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresCompanion: boolean;
  companionName?: string;
  companionPhone?: string;
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
}

interface RouteGroupPlan {
  key: string;
  destination: string;
  dispatchType: DispatchType;
  scheduledAt: string;
  rowCount: number;
  preferredVehiclePlate: string | null;
}

interface ImportRecurringIntelligence {
  knownPatients: number;
  knownDestinations: number;
  recurringRouteMatches: number;
  futureHooks: string[];
}

const MOBILITY_VALUES = ['NORMAL', 'WHEELCHAIR', 'STRETCHER', 'OXYGEN'] as const;
const RISK_VALUES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const PRIORITY_VALUES = ['EMERGENCY', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'PENDING'] as const;
const LOCATION_TYPES = ['HOSPITAL', 'CLINIC', 'LAB', 'UBS', 'SPECIALTY_CENTER', 'HEMODIALYSIS', 'ONCOLOGY_CENTER'] as const;

function normalizeHeader(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function sanitizeCpf(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const v = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'y', 's'].includes(v);
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const str = String(value ?? '').trim();
  if (!str) return null;
  const asNumber = Number(str);
  if (!Number.isNaN(asNumber) && asNumber > 30000 && asNumber < 70000) {
    const parsed = XLSX.SSF.parse_date_code(asNumber);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S));
  }
  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) return date;
  return null;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const normalized = String(value ?? '').trim().toUpperCase();
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : fallback;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function buildSyntheticCpf(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  const digits = hash.replace(/[a-f]/gi, '').padEnd(10, '0').slice(0, 10);
  return `9${digits}`;
}

function parseTimeParts(value: unknown): { hours: number; minutes: number } | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const hhmm = /^([01]?\d|2[0-3])[:h]([0-5]\d)$/.exec(text);
  if (!hhmm) return null;
  return { hours: Number(hhmm[1]), minutes: Number(hhmm[2]) };
}

function applyTime(date: Date, timeRaw: unknown): Date {
  const out = new Date(date);
  const parsedTime = parseTimeParts(timeRaw);
  if (parsedTime) {
    out.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
    return out;
  }
  out.setHours(8, 0, 0, 0);
  return out;
}

function inferDestinationType(destinationName: string): NormalizedRow['destinationType'] {
  const normalized = normalizeHeader(destinationName);
  if (normalized.includes('hemodialise')) return 'HEMODIALYSIS';
  if (normalized.includes('oncolog')) return 'ONCOLOGY_CENTER';
  if (normalized.includes('ubs')) return 'UBS';
  if (normalized.includes('laborat') || normalized.includes('lab')) return 'LAB';
  if (normalized.includes('clinica')) return 'CLINIC';
  return 'HOSPITAL';
}

@Injectable()
export class SchedulingImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patientsService: PatientsService,
    private readonly queuesService: QueuesService,
    private readonly routesService: RoutesService,
    private readonly tripsService: TripsService,
    private readonly operationEvents: OperationEventsService,
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

    const intelligence = await this.buildRecurringIntelligence(tenantId, rows);
    const plan = this.buildGroupPlan(rows);
    if (options.mode === 'PREVIEW') {
      return {
        mode: 'PREVIEW',
        file: { name: file.originalname, rowCount: rows.length },
        warnings,
        plan,
        intelligence,
      };
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { city: true, state: true },
    });
    if (!tenant) throw new BadRequestException('Tenant not found');

    const operationDate = new Date();
    operationDate.setHours(0, 0, 0, 0);
    const operation = await this.prisma.operation.upsert({
      where: { tenantId_date: { tenantId, date: operationDate } },
      create: {
        tenantId,
        date: operationDate,
        status: 'IMPORTED' as any,
        createdAutomatically: false,
        totalPatients: rows.length,
      },
      update: {
        status: 'IMPORTED' as any,
        totalPatients: { increment: rows.length },
      },
    });

    await this.operationEvents.record({
      tenantId,
      operationId: operation.id,
      eventType: 'SPREADSHEET_IMPORTED',
      actorType: 'IMPORT',
      metadata: {
        fileName: file.originalname ?? null,
        rowCount: rows.length,
        mode: options.mode,
        planCount: plan.length,
      },
    });

    const groups = new Map<string, Array<{ row: NormalizedRow; patientId: string; queueId: string; destinationId: string }>>();
    let createdPatients = 0;
    let reusedPatients = 0;
    let createdQueues = 0;
    let reusedQueues = 0;

    for (const row of rows) {
      const patient = await this.findOrCreatePatient(tenantId, row);
      if (patient.created) createdPatients += 1;
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

    const vehicles = await this.prisma.vehicle.findMany({
      where: { tenantId, active: true },
      select: { id: true, plate: true, capacity: true, status: true },
      orderBy: [{ capacity: 'asc' }, { plate: 'asc' }],
    });
    const usedVehicles = new Set<string>();

    let createdRoutes = 0;
    let createdTrips = 0;
    const routeResults: Array<{ routeId: string; destination: string; assignedVehicle: string | null; tripCount: number }> = [];

    for (const [, items] of groups) {
      const first = items[0];
      const assignment = this.pickVehicle(vehicles, usedVehicles, items.length, first.row.preferredVehiclePlate, options.autoAssignVehicles);
      if (assignment?.id) usedVehicles.add(assignment.id);

      const route = await this.routesService.create(tenantId, {
        origin: first.row.origin || options.defaultOrigin || 'Central PRAEM OPS',
        destination: first.row.destinationName,
        date: first.row.scheduledAt.toISOString(),
        scheduledAt: first.row.dispatchType === 'SCHEDULED' ? first.row.scheduledAt.toISOString() : null,
        dispatchType: first.row.dispatchType ?? options.defaultDispatchType,
        status: first.row.dispatchType === 'SCHEDULED' ? 'SCHEDULED' : 'PLANNED',
        vehicleId: assignment?.id ?? undefined,
      });
      createdRoutes += 1;

      for (const item of items) {
        await this.tripsService.create(tenantId, {
          routeId: route.id,
          patientId: item.patientId,
          notes: item.row.notes,
        });
        createdTrips += 1;
        await this.prisma.operationalQueue.update({
          where: { id: item.queueId },
          data: { status: first.row.dispatchType === 'SCHEDULED' ? QueueStatus.SCHEDULED : QueueStatus.ASSIGNED },
        });
      }

      routeResults.push({
        routeId: route.id,
        destination: first.row.destinationName,
        assignedVehicle: assignment?.plate ?? null,
        tripCount: items.length,
      });
    }

    return {
      mode: 'APPLY',
      file: { name: file.originalname, rowCount: rows.length },
      warnings,
      summary: {
        createdPatients,
        reusedPatients,
        createdQueues,
        reusedQueues,
        createdRoutes,
        createdTrips,
      },
      intelligence,
      routes: routeResults,
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
      map.set(normalizeHeader(key), value);
    }
    const value = (...keys: string[]) => {
      for (const key of keys) {
        const hit = map.get(normalizeHeader(key));
        if (hit !== undefined && String(hit).trim() !== '') return hit;
      }
      return '';
    };

    const patientName = normalizeText(value('patientName', 'patient', 'nomePaciente', 'nome', 'paciente', 'usuario', 'beneficiario'));
    const cpfRaw = sanitizeCpf(String(value('cpf', 'documento', 'patientCpf', 'cartaoSus', 'sus', 'cns')));
    const sourceCpfProvided = cpfRaw.length === 11;
    const destinationName = normalizeText(
      value('destination', 'destino', 'hospital', 'clinica', 'clínica', 'unidade', 'healthcareLocation'),
    );
    if (!patientName || !destinationName) {
      return null;
    }

    const phone = normalizeText(value('phone', 'telefone', 'celular', 'contato')) || undefined;
    const destinationAddress = normalizeText(
      value('destinationAddress', 'enderecoDestino', 'hospitalEndereco', 'enderecoHospital', 'endereco', 'logradouro'),
    );
    const birthDate = parseDate(value('birthDate', 'dataNascimento', 'nascimento')) ?? new Date('1970-01-01T00:00:00Z');
    const appointmentDateRaw = value('appointmentDate', 'dataConsulta', 'appointment', 'scheduledAt', 'data', 'dia', 'date');
    const appointmentBaseDate = parseDate(appointmentDateRaw) ?? new Date();
    const scheduledAt = applyTime(appointmentBaseDate, value('appointmentTime', 'horaConsulta', 'hora', 'horario', 'time'));
    const defaultDispatchType = scheduledAt.getTime() > Date.now() ? 'SCHEDULED' : 'IMMEDIATE';
    const cpf = sourceCpfProvided
      ? cpfRaw
      : buildSyntheticCpf(
          `${normalizeHeader(patientName)}|${normalizeHeader(phone ?? '')}|${normalizeHeader(destinationName)}|${scheduledAt.toISOString().slice(0, 10)}`,
        );

    return {
      rowNumber,
      patientName,
      cpf,
      sourceCpfProvided,
      birthDate,
      phone,
      address: normalizeText(value('address', 'patientAddress', 'enderecoPaciente')) || destinationAddress || 'Sem endereço informado',
      mobility: enumValue(value('mobility', 'mobilidade'), MOBILITY_VALUES, 'NORMAL'),
      clinicalRisk: enumValue(value('clinicalRisk', 'risk', 'riscoClinico'), RISK_VALUES, 'LOW'),
      requiresCompanion: toBoolean(value('requiresCompanion', 'acompanhante', 'needsCompanion')),
      companionName: String(value('companionName', 'nomeAcompanhante')).trim() || undefined,
      companionPhone: String(value('companionPhone', 'telefoneAcompanhante')).trim() || undefined,
      appointmentDate: scheduledAt,
      destinationName,
      destinationCity: String(value('destinationCity', 'cidadeDestino', 'cidade')).trim() || undefined,
      destinationState: String(value('destinationState', 'estadoDestino', 'uf')).trim() || undefined,
      destinationAddress: destinationAddress || undefined,
      destinationType: enumValue(value('destinationType', 'tipoDestino', 'locationType'), LOCATION_TYPES, inferDestinationType(destinationName)),
      priority: enumValue(value('priority', 'prioridade'), PRIORITY_VALUES, 'NORMAL'),
      queueType: enumValue(value('queueType', 'tipoFila'), ['MEDICAL', 'LOGISTICS'] as const, 'LOGISTICS'),
      notes: String(value('notes', 'observacoes')).trim() || undefined,
      dispatchType: enumValue(value('dispatchType', 'tipoDespacho'), ['SCHEDULED', 'IMMEDIATE'] as const, defaultDispatchType),
      scheduledAt: applyTime(parseDate(value('dispatchAt', 'scheduledAt', 'horarioDespacho')) ?? appointmentBaseDate, value('dispatchTime', 'horaDespacho')),
      origin: normalizeText(value('origin', 'origem', 'cidadeOrigem', 'municipioOrigem')) || 'Central PRAEM OPS',
      preferredVehiclePlate: String(value('vehiclePlate', 'placaVeiculo')).trim() || undefined,
    };
  }

  private buildGroupPlan(rows: NormalizedRow[]): RouteGroupPlan[] {
    const map = new Map<string, RouteGroupPlan>();
    for (const row of rows) {
      const key = `${row.destinationName}|${row.dispatchType}|${row.scheduledAt.toISOString().slice(0, 16)}`;
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
    return Array.from(map.values()).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  private groupKey(row: NormalizedRow, destinationId: string) {
    const minuteKey = row.scheduledAt.toISOString().slice(0, 16);
    return `${destinationId}|${row.dispatchType}|${minuteKey}`;
  }

  private async findOrCreatePatient(tenantId: string, row: NormalizedRow) {
    const existing = row.sourceCpfProvided
      ? await this.prisma.patient.findFirst({
          where: { tenantId, cpf: row.cpf },
          select: { id: true },
        })
      : await this.prisma.patient.findFirst({
          where: {
            tenantId,
            OR: [
              {
                name: { equals: row.patientName, mode: 'insensitive' },
                ...(row.phone ? { phone: { equals: row.phone } } : {}),
              },
              { cpf: row.cpf },
            ],
          },
          select: { id: true },
        });
    if (existing) return { id: existing.id, created: false };
    const created = await this.patientsService.upsertFromSusImport(tenantId, {
      name: row.patientName,
      cpf: row.cpf,
      birthDate: row.birthDate.toISOString(),
      phone: row.phone,
      address: row.address,
      mobility: row.mobility,
      clinicalRisk: row.clinicalRisk,
      requiresCompanion: row.requiresCompanion,
      companionName: row.companionName,
      companionPhone: row.companionPhone,
      notes: row.notes,
      recurringPatient: false,
    });
    return { id: created.id as string, created: Boolean((created as any)._created) };
  }

  private async findOrCreateDestination(tenantId: string, row: NormalizedRow, fallbackCity: string, fallbackState: string) {
    const existing = await this.prisma.healthcareLocation.findFirst({
      where: {
        tenantId,
        active: true,
        name: { equals: row.destinationName, mode: 'insensitive' },
        city: { equals: row.destinationCity ?? fallbackCity, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });
    if (existing) return existing;

    return this.prisma.healthcareLocation.create({
      data: {
        tenantId,
        name: row.destinationName,
        type: row.destinationType,
        city: row.destinationCity ?? fallbackCity,
        state: row.destinationState ?? fallbackState,
        address: row.destinationAddress ?? row.destinationName,
        active: true,
      },
      select: { id: true, name: true },
    });
  }

  private async findOrCreateQueue(tenantId: string, patientId: string, destinationId: string, row: NormalizedRow) {
    const existing = await this.prisma.operationalQueue.findFirst({
      where: {
        tenantId,
        patientId,
        healthcareLocationId: destinationId,
        appointmentDate: row.appointmentDate,
        status: { in: [QueueStatus.WAITING, QueueStatus.CONFIRMED, QueueStatus.ASSIGNED, QueueStatus.SCHEDULED] },
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    const created = await this.queuesService.create(tenantId, {
      patientId,
      healthcareLocationId: destinationId,
      destination: row.destinationName,
      appointmentDate: row.appointmentDate,
      priority: row.priority,
      queueType: row.queueType,
      status: 'WAITING',
      confirmationStatus: 'PENDING',
      notes: row.notes,
    });
    return { id: created.id as string, created: true };
  }

  private pickVehicle(
    vehicles: Array<{ id: string; plate: string; capacity: number; status: string }>,
    usedVehicles: Set<string>,
    passengerCount: number,
    requestedPlate: string | undefined,
    autoAssignVehicles: boolean,
  ) {
    if (requestedPlate) {
      const requested = vehicles.find((v) => v.plate.toUpperCase() === requestedPlate.toUpperCase());
      if (requested && !usedVehicles.has(requested.id)) return requested;
    }
    if (!autoAssignVehicles) return null;

    const available = vehicles.filter((v) => ['AVAILABLE', 'WAITING'].includes(String(v.status).toUpperCase()) && !usedVehicles.has(v.id));
    if (available.length === 0) return null;
    const fits = available.filter((v) => v.capacity >= passengerCount);
    if (fits.length > 0) return fits.sort((a, b) => a.capacity - b.capacity)[0];
    return available.sort((a, b) => b.capacity - a.capacity)[0];
  }

  private async buildRecurringIntelligence(tenantId: string, rows: NormalizedRow[]): Promise<ImportRecurringIntelligence> {
    const cpfSet = new Set(rows.filter((r) => r.sourceCpfProvided).map((r) => r.cpf));
    const destinationSet = new Set(rows.map((r) => r.destinationName).filter((name) => name.trim().length > 0));
    const destinations = Array.from(destinationSet);

    const [knownByCpf, knownDestinations, historicalRoutes] = await Promise.all([
      cpfSet.size
        ? this.prisma.patient.findMany({
            where: { tenantId, cpf: { in: Array.from(cpfSet) } },
            select: { id: true },
          })
        : Promise.resolve([]),
      destinations.length
        ? this.prisma.healthcareLocation.findMany({
            where: {
              tenantId,
              active: true,
              OR: destinations.map((name) => ({ name: { equals: name, mode: 'insensitive' } })),
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      this.prisma.route.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { destination: true, scheduledAt: true, date: true },
      }),
    ]);

    const routeSignatures = new Set(
      historicalRoutes.map((r) => {
        const baseDate = r.scheduledAt ?? r.date;
        const hour = baseDate ? new Date(baseDate).getHours().toString().padStart(2, '0') : '08';
        return `${normalizeHeader(r.destination)}|${hour}`;
      }),
    );
    const recurringRouteMatches = rows.reduce((count, row) => {
      const signature = `${normalizeHeader(row.destinationName)}|${row.scheduledAt.getHours().toString().padStart(2, '0')}`;
      return routeSignatures.has(signature) ? count + 1 : count;
    }, 0);

    return {
      knownPatients: knownByCpf.length,
      knownDestinations: knownDestinations.length,
      recurringRouteMatches,
      futureHooks: [
        'recurring_patient_recognition',
        'known_destination_ranking',
        'suggested_route_grouping',
        'suggested_schedule_windows',
      ],
    };
  }
}
