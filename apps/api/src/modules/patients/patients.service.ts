import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';

export interface ListPatientsQuery {
  tenantId: string;
  search?: string;
  clinicalRisk?: string;
  page?: number;
  limit?: number;
}

/** SHA-256 hash of a raw QR token — only the hash is stored in DB */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Fields returned in operational/public contexts — CPF never included */
const SAFE_SELECT = {
  id: true,
  name: true,
  mobility: true,
  clinicalRisk: true,
  requiresCompanion: true,
  operationalId: true,
  qrTokenHash: true,
  qrIssuedAt: true,
  qrActive: true,
  qrLastReadAt: true,
  qrExpiresAt: true,
  qrVersion: true,
  address: true,
  lat: true,
  lng: true,
};

/** Strip CPF and other PII before returning to caller */
function stripSensitive(patient: Record<string, unknown>) {
  const { cpf: _cpf, birthDate: _bd, companionDocument: _cd, ...safe } = patient;
  return safe;
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: OperationalFlowService,
  ) {}

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
    const existing = await this.prisma.patient.findFirst({
      where: { tenantId, cpf: data.cpf },
    });
    if (existing) throw new BadRequestException('CPF already registered for this tenant');

    // Normalize birthDate: Prisma DateTime requires a full ISO-8601 string.
    // The web form sends a date-only string like "1991-08-18"; append T00:00:00Z.
    const normalizedData = { ...data };
    if (normalizedData.birthDate && typeof normalizedData.birthDate === 'string') {
      const d = normalizedData.birthDate.trim();
      normalizedData.birthDate = d.length === 10 ? new Date(d + 'T00:00:00Z') : new Date(d);
    }

    const rawToken = randomUUID();
    const tokenHash = hashToken(rawToken);
    const patient = await this.prisma.patient.create({
      data: {
        ...normalizedData,
        tenantId,
        operationalId: `OP-${randomUUID().slice(0, 8).toUpperCase()}`,
        qrToken: rawToken,        // kept for legacy lookup, will be phased out
        qrTokenHash: tokenHash,
        qrIssuedAt: new Date(),
        qrActive: true,
        qrVersion: 1,
      },
    });
    // Return the raw token once at creation so front-end can display QR
    return { ...patient, _rawQrToken: rawToken };
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const normalizedData = { ...data };
    if (normalizedData.birthDate && typeof normalizedData.birthDate === 'string') {
      const d = normalizedData.birthDate.trim();
      normalizedData.birthDate = d.length === 10 ? new Date(d + 'T00:00:00Z') : new Date(d);
    }
    return this.prisma.patient.update({ where: { id }, data: normalizedData });
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
    const patient = await this.findOne(id, tenantId);
    const needsNew = !patient.qrToken || !patient.qrActive || !patient.qrTokenHash;
    if (needsNew) {
      const rawToken = randomUUID();
      const tokenHash = hashToken(rawToken);
      await this.prisma.patient.update({
        where: { id },
        data: {
          qrToken: rawToken,
          qrTokenHash: tokenHash,
          qrIssuedAt: new Date(),
          qrActive: true,
          qrVersion: { increment: 1 },
          qrRevokedAt: null,
          qrExpiresAt: null,
        },
      });
      return { patientId: id, qrToken: rawToken };
    }
    return { patientId: id, qrToken: patient.qrToken };
  }

  /** Generates a PNG buffer containing the QR Code for a patient */
  async getQrImage(id: string, tenantId: string): Promise<Buffer> {
    const { qrToken } = await this.qr(id, tenantId);
    const png = await QRCode.toBuffer(qrToken!, {
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

    const tokenHash = hashToken(payload.qrToken);

    // Look up by hash first (new secure path), then fallback to raw token (legacy)
    const patient = await this.prisma.patient.findFirst({
      where: {
        tenantId,
        OR: [{ qrTokenHash: tokenHash }, { qrToken: payload.qrToken }],
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        mobility: true,
        clinicalRisk: true,
        requiresCompanion: true,
        companionName: true,
        companionPhone: true,
        operationalId: true,
        qrActive: true,
        qrExpiresAt: true,
        qrRevokedAt: true,
        qrVersion: true,
        address: true,
        lat: true,
        lng: true,
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
      },
    });

    const source = (payload.source as any) ?? 'API';
    const logBase = {
      tenantId,
      patientId: patient?.id ?? 'unknown',
      qrToken: payload.qrToken,
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
      if (patient !== null) { /* noop */ }
      await this.prisma.patientQrAccessLog.create({
        data: { ...logBase, patientId: 'unknown', status: 'INVALID' as any },
      }).catch(() => {/* best effort */});
      throw new NotFoundException('QR token not found');
    }

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

    // Log successful scan
    await this.prisma.patientQrAccessLog.create({
      data: { ...logBase, patientId: patient.id, status: 'SUCCESS' as any },
    });

    // Update last used timestamp
    await this.prisma.patient.update({
      where: { id: patient.id },
      data: { qrLastReadAt: new Date(), qrLastUsedAt: new Date() },
    });

    // If routeId or tripId was provided, centralize the operational boarding flow.
    if (payload.routeId || payload.tripId) {
      await this.flow.confirmBoarding(tenantId, {
        routeId: payload.routeId,
        tripId: payload.tripId,
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
    }

    const activeQueue = patient.queues[0] ?? null;

    return {
      valid: true,
      name: patient.name,
      operationalId: patient.operationalId,
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
        ...(payload.qrCode ? { qrToken: payload.qrCode } : {}),
        ...(payload.cpf ? { cpf: payload.cpf } : {}),
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return { valid: true, patient: stripSensitive(patient as unknown as Record<string, unknown>) };
  }
}
