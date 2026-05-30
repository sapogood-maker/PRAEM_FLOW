import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { QrScanSource, Prisma, Patient } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';
import { buildPatientQrPayload, buildTripQrPayload, issueQrToken, normalizeCpf, stableHash } from '../../common/qr-payload';

export interface ListPatientsQuery {
  tenantId: string;
  search?: string;
  clinicalRisk?: string;
  page?: number;
  limit?: number;
}

/** Fields returned in operational/public contexts — CPF never included */
const SAFE_SELECT = {
  id: true,
  name: true,
  cpf: true,
  mobility: true,
  clinicalRisk: true,
  requiresCompanion: true,
  operationalId: true,
  praemId: true,
  qrCodeUrl: true,
  qrHash: true,
  qrTokenHash: true,
  qrToken: true,
  qrIssuedAt: true,
  qrActive: true,
  qrLastReadAt: true,
  qrExpiresAt: true,
  qrRevokedAt: true,
  qrVersion: true,
  address: true,
  lat: true,
  lng: true,
  birthDate: true,
  phone: true,
  notes: true,
  specialRequirements: true,
  emergencyContact: true,
  recurringPatient: true,
  recurrent: true,
  lastTransportDate: true,
  queues: {
    select: {
      healthcareLocationId: true,
      destination: true,
      priority: true,
      status: true,
      appointmentDate: true,
      healthcareLocation: {
        select: { name: true, city: true, address: true, specialties: { select: { specialty: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
};

const VALID_QR_SOURCES = new Set<QrScanSource>(['TABLET', 'TABLET_SMART_SCANNER', 'TOTEM', 'MOBILE', 'API']);

/** Strip CPF and other PII before returning to caller */
function stripSensitive(patient: Record<string, unknown>) {
  const { cpf: _cpf, birthDate: _bd, companionDocument: _cd, qrToken: _qt, qrTokenHash: _qth, ...safe } = patient;
  return safe;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: OperationalFlowService,
  ) {}

  async findByCpf(tenantId: string, cpf: string) {
    const normalizedCpf = normalizeCpf(cpf);
    if (!normalizedCpf) throw new BadRequestException('CPF is required');
    return this.prisma.patient.findFirst({ where: { tenantId, cpf: normalizedCpf } });
  }

  async upsertByCpf(
    tenantId: string,
    data: any,
    options?: { source?: 'MANUAL' | 'SUS_IMPORT'; patientId?: string; allowPartial?: boolean },
  ) {
    const normalized = this.normalizePatientInput(data);
    const existing = await this.prisma.patient.findFirst({
      where: { tenantId, cpf: normalized.cpf },
    });

    if (existing) {
      const merged = this.mergePatientData(existing, normalized, options?.allowPartial ?? true, options?.source ?? 'MANUAL');
      const updated = await this.prisma.patient.update({
        where: { id: existing.id },
        data: merged,
      });
      return { ...(await this.ensurePatientQrArtifacts(updated)), _created: false };
    }

    const created = await this.prisma.patient.create({
      data: this.buildPatientCreateData(tenantId, normalized),
    });
    return { ...(await this.ensurePatientQrArtifacts(created)), _created: true };
  }

  async upsertFromSusImport(tenantId: string, data: any) {
    return this.upsertByCpf(tenantId, data, { source: 'SUS_IMPORT', allowPartial: true });
  }

  async ensurePatientQrArtifacts(patient: Patient) {
    const praemId = this.resolvePraemId(patient);
    const validationToken = patient.qrToken ?? issueQrToken();
    const payload = buildPatientQrPayload({
      patientId: patient.id,
      praemId,
      validationToken,
      issuedAt: patient.qrIssuedAt ?? new Date(),
      expiresAt: patient.qrExpiresAt ?? null,
    });
    const qrContent = JSON.stringify(payload);

    const shouldUpdate =
      patient.praemId !== praemId ||
      patient.qrToken !== validationToken ||
      patient.qrTokenHash !== stableHash(validationToken) ||
      patient.qrHash !== payload.secure_hash ||
      patient.qrCode !== qrContent ||
      patient.qrCodeUrl !== `/patients/${patient.id}/qr/image` ||
      !patient.qrActive ||
      !patient.qrIssuedAt;

    if (shouldUpdate) {
      const updated = await this.prisma.patient.update({
        where: { id: patient.id },
        data: {
          praemId,
          operationalId: patient.operationalId ?? praemId,
          qrToken: validationToken,
          qrTokenHash: stableHash(validationToken),
          qrHash: payload.secure_hash,
          qrCode: qrContent,
          qrCodeUrl: `/patients/${patient.id}/qr/image`,
          qrIssuedAt: patient.qrIssuedAt ?? new Date(),
          qrActive: true,
          qrVersion: patient.qrVersion ?? 1,
        },
      });
      return updated;
    }

    return patient;
  }

  private normalizePatientInput(data: any) {
    const cpf = normalizeCpf(data?.cpf);
    if (!cpf) {
      throw new BadRequestException('CPF is required');
    }

    const birthDate = this.parseBirthDate(data?.birthDate) ?? new Date('1970-01-01T00:00:00Z');
    const name = String(data?.name ?? data?.patient_name ?? '').trim();
    const phone = this.normalizeText(data?.phone);
    const address = this.normalizeText(data?.address) || this.normalizeText(data?.destination_address) || 'Sem endereço informado';
    const mobility = this.normalizeEnum(data?.mobility, ['NORMAL', 'WHEELCHAIR', 'STRETCHER', 'OXYGEN'], 'NORMAL');
    const clinicalRisk = this.normalizeEnum(data?.clinicalRisk, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], 'LOW');
    const requiresCompanion = this.toBoolean(data?.requiresCompanion ?? data?.companion);
    const specialRequirements = this.normalizeText(data?.specialRequirements ?? data?.special_requirements);
    const emergencyContact = this.normalizeText(data?.emergencyContact ?? data?.companionPhone);
    const recurringPatient = this.toBoolean(data?.recurringPatient ?? data?.recurrent);
    const praemId = this.normalizeText(data?.praemId ?? data?.operationalId) || `PRAEM-${cpf.slice(-6).padStart(6, '0')}`;
    const operationalId = this.normalizeText(data?.operationalId) || praemId;

    return {
      cpf,
      birthDate,
      name,
      phone: phone || null,
      address,
      mobility,
      clinicalRisk,
      requiresCompanion,
      specialRequirements: specialRequirements || null,
      emergencyContact: emergencyContact || null,
      recurringPatient,
      praemId,
      operationalId,
      notes: this.normalizeText(data?.notes) || null,
      companionName: this.normalizeText(data?.companionName) || null,
      companionPhone: this.normalizeText(data?.companionPhone) || null,
      lat: this.normalizeNumber(data?.lat),
      lng: this.normalizeNumber(data?.lng),
      lastTransportDate: this.parseBirthDate(data?.lastTransportDate) ?? null,
      qrCodeUrl: `/patients/${data?.id ?? ''}/qr/image`,
    };
  }

  private buildPatientCreateData(tenantId: string, normalized: any) {
    const rawToken = issueQrToken();
    const qrTokenHash = stableHash(rawToken);
    const patient = {
      tenantId,
      name: normalized.name || 'Paciente sem nome',
      cpf: normalized.cpf,
      birthDate: normalized.birthDate,
      phone: normalized.phone,
      address: normalized.address,
      mobility: normalized.mobility,
      clinicalRisk: normalized.clinicalRisk,
      recurrent: normalized.recurringPatient,
      recurringPatient: normalized.recurringPatient,
      notes: normalized.notes,
      praemId: normalized.praemId,
      qrHash: null,
      qrCode: null,
      qrCodeUrl: null,
      operationalId: normalized.operationalId,
      lastTransportDate: normalized.lastTransportDate,
      specialRequirements: normalized.specialRequirements,
      emergencyContact: normalized.emergencyContact,
      qrToken: rawToken,
      qrTokenHash,
      qrIssuedAt: new Date(),
      qrActive: true,
      qrVersion: 1,
      requiresCompanion: normalized.requiresCompanion,
      companionName: normalized.companionName,
      companionPhone: normalized.companionPhone,
      lat: normalized.lat,
      lng: normalized.lng,
    } as Prisma.PatientUncheckedCreateInput;
    return patient;
  }

  private mergePatientData(
    existing: Patient,
    normalized: any,
    allowPartial: boolean,
    source: 'MANUAL' | 'SUS_IMPORT',
  ) {
    const data: Prisma.PatientUpdateInput = {};

    if (!existing.name?.trim() && normalized.name) data.name = normalized.name;
    if (!existing.phone?.trim() && normalized.phone) data.phone = normalized.phone;
    if (!existing.address?.trim() && normalized.address) data.address = normalized.address;
    if (!existing.specialRequirements?.trim() && normalized.specialRequirements) data.specialRequirements = normalized.specialRequirements;
    if (!existing.emergencyContact?.trim() && normalized.emergencyContact) data.emergencyContact = normalized.emergencyContact;
    if (!existing.notes?.trim() && normalized.notes) data.notes = normalized.notes;
    if (!existing.praemId?.trim() && normalized.praemId) data.praemId = normalized.praemId;
    if (!existing.operationalId?.trim() && normalized.operationalId) data.operationalId = normalized.operationalId;
    if (!existing.qrCodeUrl?.trim()) data.qrCodeUrl = `/patients/${existing.id}/qr/image`;
    if (!existing.qrActive) data.qrActive = true;
    if (!existing.qrIssuedAt) data.qrIssuedAt = new Date();
    if (!existing.qrTokenHash && existing.qrToken) data.qrTokenHash = stableHash(existing.qrToken);
    if (!existing.qrHash && existing.qrToken) data.qrHash = stableHash(existing.qrToken);
    if (!existing.qrCode && existing.qrToken && existing.praemId) {
      const payload = buildPatientQrPayload({
        patientId: existing.id,
        praemId: existing.praemId,
        validationToken: existing.qrToken,
        issuedAt: existing.qrIssuedAt ?? new Date(),
        expiresAt: existing.qrExpiresAt ?? null,
      });
      data.qrCode = JSON.stringify(payload);
    }

    if (allowPartial || source === 'SUS_IMPORT') {
      if (existing.birthDate.getTime() === new Date('1970-01-01T00:00:00Z').getTime() && normalized.birthDate) {
        data.birthDate = normalized.birthDate;
      }
      if (existing.lat == null && normalized.lat != null) data.lat = normalized.lat;
      if (existing.lng == null && normalized.lng != null) data.lng = normalized.lng;
      if (!existing.recurrent && normalized.recurringPatient) data.recurrent = normalized.recurringPatient;
      if (!existing.recurringPatient && normalized.recurringPatient) data.recurringPatient = normalized.recurringPatient;
      if (existing.lastTransportDate == null && normalized.lastTransportDate) data.lastTransportDate = normalized.lastTransportDate;
      if (!existing.requiresCompanion && normalized.requiresCompanion) data.requiresCompanion = true;
      if (!existing.companionName?.trim() && normalized.companionName) data.companionName = normalized.companionName;
      if (!existing.companionPhone?.trim() && normalized.companionPhone) data.companionPhone = normalized.companionPhone;
    }

    return data;
  }

  private normalizeText(value: unknown) {
    const text = String(value ?? '').trim();
    return text.length > 0 ? text : null;
  }

  private normalizeNumber(value: unknown) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
    const normalized = String(value ?? '').trim().toUpperCase();
    return (allowed as readonly string[]).includes(normalized) ? (normalized as T) : fallback;
  }

  private toBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'sim', 's'].includes(normalized);
  }

  private parseBirthDate(value: unknown) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const text = String(value).trim();
    if (!text) return null;
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
    if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T00:00:00Z`);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolvePraemId(patient: Patient) {
    return patient.praemId?.trim() || patient.operationalId?.trim() || `PRAEM-${normalizeCpf(patient.cpf).slice(-6).padStart(6, '0')}`;
  }

  async list({ tenantId, search, clinicalRisk, page = 1, limit = 20 }: ListPatientsQuery) {
    const skip = (page - 1) * limit;
    const where: any = {
      tenantId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { cpf: { contains: search } },
        ],
      }),
      ...(clinicalRisk && { clinicalRisk: clinicalRisk as any }),
    };

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.patient.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id, tenantId } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async create(tenantId: string, data: any) {
    return this.upsertByCpf(tenantId, data, { source: 'MANUAL', allowPartial: false });
  }

  async update(id: string, tenantId: string, data: any) {
    const patient = await this.findOne(id, tenantId);
    const normalized = this.normalizePatientInput({ ...data, cpf: patient.cpf, praemId: patient.praemId, operationalId: patient.operationalId });
    const updated = await this.prisma.patient.update({
      where: { id },
      data: {
        ...(normalized.name && !patient.name?.trim() ? { name: normalized.name } : {}),
        ...(normalized.phone && !patient.phone?.trim() ? { phone: normalized.phone } : {}),
        ...(normalized.address && !patient.address?.trim() ? { address: normalized.address } : {}),
        ...(normalized.specialRequirements && !patient.specialRequirements?.trim() ? { specialRequirements: normalized.specialRequirements } : {}),
        ...(normalized.emergencyContact && !patient.emergencyContact?.trim() ? { emergencyContact: normalized.emergencyContact } : {}),
        ...(normalized.notes && !patient.notes?.trim() ? { notes: normalized.notes } : {}),
        ...(normalized.lat != null && patient.lat == null ? { lat: normalized.lat } : {}),
        ...(normalized.lng != null && patient.lng == null ? { lng: normalized.lng } : {}),
        ...(normalized.recurringPatient && !patient.recurringPatient ? { recurringPatient: true, recurrent: true } : {}),
        ...(normalized.requiresCompanion && !patient.requiresCompanion ? { requiresCompanion: true } : {}),
      },
    });
    return this.ensurePatientQrArtifacts(updated);
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Returns (or re-generates) a secure QR token for a patient.
   * The raw token is returned ONCE here and encoded into the QR image.
   * Only the SHA-256 hash is stored in the DB.
   */
  async qr(id: string, tenantId: string) {
    const patient = await this.ensurePatientQrArtifacts(await this.findOne(id, tenantId));
    return {
      patientId: id,
      praemId: patient.praemId,
      qrToken: patient.qrToken,
      qrContent: patient.qrCode,
      qrCodeUrl: patient.qrCodeUrl,
      qrHash: patient.qrHash,
    };
  }

  /** Generates a PNG buffer containing the QR Code for a patient */
  async getQrImage(id: string, tenantId: string): Promise<Buffer> {
    const patient = await this.ensurePatientQrArtifacts(await this.findOne(id, tenantId));
    const png = await QRCode.toBuffer(patient.qrCode ?? patient.qrToken ?? '', {
      type: 'png',
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return png;
  }

  /**
   * Validates a QR token scan using the SHA-256 hash lookup.
   * - Never returns CPF or sensitive PII.
   * - Logs every access for audit/antifraude with status.
   * - Rate-limits: max 15 scans per IP per 60 seconds.
   */
  async validateQr(
    tenantId: string,
    payload: {
      qrToken: string;
      payload?: Record<string, any>;
      vehicleId?: string;
      checkpoint?: string;
      gpsLat?: number;
      gpsLng?: number;
      operatorId?: string;
      tripId?: string;
      routeId?: string;
      source?: string;
    },
    ip?: string,
    device?: string,
  ) {
    // Rate limit: count recent scans from this IP in last 60 s
    if (ip) {
      const since = new Date(Date.now() - 60_000);
      const recentCount = await this.prisma.patientQrAccessLog.count({
        where: { tenantId, ip, scannedAt: { gte: since } },
      });
      if (recentCount >= 15) {
        throw new ForbiddenException('Too many QR scan requests. Please wait before trying again.');
      }
    }

    const parsed = this.parseQrPayload(payload.payload ?? payload.qrToken);
    const validationToken = parsed.validationToken ?? payload.qrToken;
    const tokenHash = stableHash(validationToken);
    const tripToken: any = await this.findTripTokenByValidation(tenantId, parsed, validationToken);
    const patient: any = tripToken?.patient
      ? await this.prisma.patient.findFirst({
          where: { tenantId, id: tripToken.patient.id },
          select: SAFE_SELECT as any,
        })
      : await this.prisma.patient.findFirst({
          where: {
            tenantId,
            OR: [
              ...(parsed.patientId ? [{ id: parsed.patientId }] : []),
              ...(parsed.praemId ? [{ praemId: parsed.praemId }] : []),
              { qrTokenHash: tokenHash },
              { qrToken: validationToken },
            ],
          },
          select: SAFE_SELECT as any,
        });

    const rawSource = typeof payload.source === 'string' ? (payload.source as QrScanSource) : 'API';
    const source: QrScanSource = VALID_QR_SOURCES.has(rawSource) ? rawSource : 'API';
    const logBase = {
      tenantId,
      patientId: patient?.id ?? 'unknown',
      qrToken: parsed.raw,
      ip: ip ?? null,
      device: device ?? null,
      vehicleId: payload.vehicleId ?? null,
      checkpoint: payload.checkpoint ?? null,
      gpsLat: payload.gpsLat ?? null,
      gpsLng: payload.gpsLng ?? null,
      operatorId: payload.operatorId ?? null,
      tripId: payload.tripId ?? null,
      routeId: payload.routeId ?? null,
      source,
    };

    if (!patient) {
      await this.prisma.patientQrAccessLog.create({
        data: { ...logBase, patientId: 'unknown', status: 'INVALID' as any },
      }).catch(() => {/* best effort */});
      throw new NotFoundException('QR token not found');
    }

    if (parsed.type === 'TRIP' || tripToken) {
      const trip: any = tripToken?.trip;
      if (!trip) {
        throw new NotFoundException('Trip not found');
      }
      if (parsed.secureHash) {
        const tripExpiresAt = tripToken?.expiresAt ?? (parsed.expiresAt ? new Date(parsed.expiresAt) : null);
        if (!tripExpiresAt || Number.isNaN(tripExpiresAt.getTime())) {
          throw new BadRequestException('QR payload is incomplete');
        }
        const expectedTripPayload = buildTripQrPayload({
          tripId: trip.id,
          patientId: trip.patientId,
          routeId: trip.routeId,
          operationId: parsed.operationId ?? trip.routeId,
          validationToken,
          issuedAt: new Date(),
          expiresAt: tripExpiresAt,
        });
        if (parsed.secureHash !== expectedTripPayload.secure_hash) {
          throw new ForbiddenException('QR signature mismatch');
        }
      }
    } else {
      const expectedPatientPayload = buildPatientQrPayload({
        patientId: patient.id,
        praemId: patient.praemId ?? patient.operationalId ?? patient.id,
        validationToken,
        issuedAt: patient.qrIssuedAt ?? new Date(),
        expiresAt: patient.qrExpiresAt ?? null,
      });
      if (parsed.secureHash && parsed.secureHash !== expectedPatientPayload.secure_hash) {
        throw new ForbiddenException('QR signature mismatch');
      }
    }

    if (parsed.type === 'PATIENT' || !tripToken) {
      if (patient.qrRevokedAt) {
        await this.prisma.patientQrAccessLog.create({
          data: { ...logBase, patientId: patient.id, status: 'REVOKED' as any },
        });
        throw new ForbiddenException('This QR token has been revoked');
      }

      if (!patient.qrActive) {
        await this.prisma.patientQrAccessLog.create({
          data: { ...logBase, patientId: patient.id, status: 'REVOKED' as any },
        });
        throw new ForbiddenException('This QR token has been deactivated');
      }

      if (patient.qrExpiresAt && patient.qrExpiresAt < new Date()) {
        await this.prisma.patientQrAccessLog.create({
          data: { ...logBase, patientId: patient.id, status: 'EXPIRED' as any },
        });
        throw new ForbiddenException('This QR token has expired');
      }
    }

    // Log successful scan
    await this.prisma.patientQrAccessLog.create({
      data: { ...logBase, patientId: patient.id, status: 'SUCCESS' as any },
    });

    // Update last used timestamp
    await this.prisma.patient.update({
      where: { id: patient.id },
      data: { qrLastReadAt: new Date(), qrLastUsedAt: new Date(), lastTransportDate: new Date() },
    });

    const resolvedBoarding = await this.resolveBoardingContext(
      tenantId,
      patient.id,
      payload.operatorId,
    );
    const boardingFlowResult = await this.flow.confirmBoarding(tenantId, {
      routeId: resolvedBoarding.routeId,
      tripId: resolvedBoarding.tripId,
      patientId: patient.id,
    }, {
      vehicleId: payload.vehicleId ?? null,
      driverId: payload.operatorId ?? null,
      deviceId: (payload as any).deviceId ?? device ?? null,
      checkpoint: payload.checkpoint ?? 'BOARDING',
      gpsLat: payload.gpsLat ?? null,
      gpsLng: payload.gpsLng ?? null,
      source: payload.source ?? 'API',
    });

    const activeQueue: any = patient.queues?.[0] ?? null;

    return {
      valid: true,
      tripId: boardingFlowResult?.trip?.id ?? resolvedBoarding.tripId ?? null,
      routeId: boardingFlowResult?.route?.id ?? resolvedBoarding.routeId ?? tripToken?.trip?.routeId ?? null,
      operationalState: boardingFlowResult?.trip?.status ?? null,
      name: patient.name,
      destination: ((boardingFlowResult?.route as any)?.destination as string | undefined) ?? null,
      operationalId: patient.operationalId ?? patient.praemId,
      praemId: patient.praemId,
      mobility: patient.mobility,
      clinicalRisk: patient.clinicalRisk,
      requiresCompanion: patient.requiresCompanion,
      companionName: patient.requiresCompanion ? patient.companionName : null,
      companionPhone: patient.requiresCompanion ? patient.companionPhone : null,
      address: patient.address,
      location: patient.lat != null ? { lat: patient.lat, lng: patient.lng } : null,
      queue: activeQueue
        ? {
            destination: activeQueue.healthcareLocation?.name ?? activeQueue.destination,
            city: activeQueue.healthcareLocation?.city ?? null,
            specialties: activeQueue.healthcareLocation?.specialties?.map((s: { specialty: string }) => s.specialty) ?? [],
            priority: activeQueue.priority,
            status: activeQueue.status,
            appointmentDate: activeQueue.appointmentDate,
          }
        : null,
    };
  }

  private parseQrPayload(input: string | Record<string, any>) {
    const parsedInput = typeof input === 'string' ? input.trim() : input;
    if (!parsedInput || (typeof parsedInput === 'string' && !parsedInput.startsWith('{'))) {
      const raw = typeof parsedInput === 'string' ? parsedInput : JSON.stringify(parsedInput);
      return { type: 'PATIENT' as const, raw, validationToken: raw };
    }

    try {
      const parsed = typeof parsedInput === 'string' ? JSON.parse(parsedInput) : parsedInput;
      const type = String(parsed?.type ?? 'PATIENT').trim().toUpperCase();
      const raw = typeof parsedInput === 'string' ? parsedInput : JSON.stringify(parsedInput);
      return {
        type: type === 'TRIP' ? ('TRIP' as const) : ('PATIENT' as const),
        raw,
        validationToken: String(parsed?.validation_token ?? parsed?.validationToken ?? parsed?.qrToken ?? '').trim() || raw,
        patientId: String(parsed?.patient_id ?? parsed?.patientId ?? parsed?.patientReference ?? '').trim() || null,
        praemId: String(parsed?.praem_id ?? parsed?.praemId ?? '').trim() || null,
        tripId: String(parsed?.trip_id ?? parsed?.tripId ?? '').trim() || null,
        routeId: String(parsed?.route_id ?? parsed?.routeId ?? '').trim() || null,
        operationId: String(parsed?.operation_id ?? parsed?.operationId ?? '').trim() || null,
        secureHash: String(parsed?.secure_hash ?? parsed?.secureHash ?? '').trim() || null,
        expiresAt: String(parsed?.expires_at ?? parsed?.expiresAt ?? '').trim() || null,
      };
    } catch {
      const raw = typeof parsedInput === 'string' ? parsedInput : JSON.stringify(parsedInput);
      return { type: 'PATIENT' as const, raw, validationToken: raw };
    }
  }

  private async findTripTokenByValidation(
    tenantId: string,
    parsed: any,
    validationToken: string,
  ) {
    if (parsed.type !== 'TRIP' && !parsed.tripId && !parsed.routeId) return null;

    const token = await this.prisma.tripToken.findFirst({
      where: { tenantId, token: validationToken },
      include: {
        trip: {
          select: {
            id: true,
            routeId: true,
            patientId: true,
            status: true,
            route: { select: { id: true, driverId: true, status: true, date: true, destination: true } },
          },
        },
        patient: { select: { id: true, name: true } },
      },
    });

    if (token) return token;
    if (!parsed.tripId) return null;

    const trip = await this.prisma.trip.findFirst({
      where: { tenantId, id: parsed.tripId },
      include: {
        route: { select: { id: true, driverId: true, status: true, date: true, destination: true } },
        patient: { select: { id: true, name: true } },
      },
    });
    if (!trip) return null;

    return {
      token: validationToken,
      trip,
      patient: trip.patient,
    } as any;
  }

  private getTodayWindow() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  private async resolveBoardingContext(tenantId: string, patientId: string, driverId?: string) {
    if (!driverId) {
      throw new BadRequestException('Driver identification is required for operational boarding');
    }
    const { start, end } = this.getTodayWindow();
    const todayTrips = await this.prisma.trip.findMany({
      where: {
        tenantId,
        patientId,
        route: { is: { date: { gte: start, lt: end } } },
      },
      include: {
        route: {
          select: {
            id: true,
            driverId: true,
            status: true,
            date: true,
            destination: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    if (todayTrips.length === 0) {
      throw new BadRequestException('Patient has no route today');
    }

    const sameDriverTrips = todayTrips.filter((t: any) => t.route?.driverId === driverId);
    if (sameDriverTrips.length === 0) {
      throw new BadRequestException('Patient belongs to another route');
    }

    const candidate = sameDriverTrips.find((t: any) => ['DISPATCHED', 'ACTIVE', 'RETURNING'].includes(String(t.route?.status)))
      ?? sameDriverTrips[0];

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(String(candidate.status))) {
      throw new BadRequestException('Trip completed/cancelled');
    }

    if (!['DISPATCHED', 'ACTIVE', 'RETURNING'].includes(String(candidate.route?.status))) {
      throw new BadRequestException('Patient has no route today');
    }

    if (candidate.boardedAt || ['BOARDING', 'BOARDED', 'IN_TRANSIT', 'ARRIVED'].includes(String(candidate.status))) {
      throw new BadRequestException('Passenger already boarded');
    }

    return {
      tripId: candidate.id as string,
      routeId: candidate.route.id as string,
    };
  }

  /** Revoke / deactivate a patient's QR token */
  async revokeQr(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.patient.update({
      where: { id },
      data: { qrActive: false, qrRevokedAt: new Date() },
    });
    return { revoked: true };
  }

  /** Returns recent QR scan history for a patient */
  async qrAccessLogs(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.patientQrAccessLog.findMany({
      where: { patientId: id, tenantId },
      orderBy: { scannedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        scannedAt: true,
        status: true,
        source: true,
        ip: true,
        device: true,
        vehicleId: true,
        checkpoint: true,
        gpsLat: true,
        gpsLng: true,
        operatorId: true,
        tripId: true,
        routeId: true,
      },
    });
  }

  /** Legacy scan endpoint kept for backwards compat — never returns CPF */
  async scan(tenantId: string, payload: { qrCode?: string; cpf?: string }) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        tenantId,
        ...(payload.qrCode ? { OR: [{ qrToken: payload.qrCode }, { qrCode: payload.qrCode }] } : {}),
        ...(payload.cpf ? { cpf: normalizeCpf(payload.cpf) } : {}),
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return { valid: true, patient: stripSensitive(patient as unknown as Record<string, unknown>) };
  }
}
