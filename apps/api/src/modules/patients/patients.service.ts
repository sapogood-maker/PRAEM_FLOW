import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';

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
  mobility: true,
  clinicalRisk: true,
  requiresCompanion: true,
  operationalId: true,
  qrToken: true,
  qrIssuedAt: true,
  qrActive: true,
  qrLastReadAt: true,
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
  constructor(private readonly prisma: PrismaService) {}

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

    const qrToken = randomUUID();
    return this.prisma.patient.create({
      data: {
        ...data,
        tenantId,
        operationalId: `OP-${randomUUID().slice(0, 8).toUpperCase()}`,
        qrToken,
        qrIssuedAt: new Date(),
        qrActive: true,
      },
    });
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    return this.prisma.patient.update({ where: { id }, data });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }

  /** Returns (or re-generates) a secure QR token for a patient — never exposes CPF */
  async qr(id: string, tenantId: string) {
    const patient = await this.findOne(id, tenantId);
    let qrToken = patient.qrToken;
    if (!qrToken || !patient.qrActive) {
      qrToken = randomUUID();
      await this.prisma.patient.update({
        where: { id },
        data: { qrToken, qrIssuedAt: new Date(), qrActive: true },
      });
    }
    return { patientId: id, qrToken };
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
   * Validates a QR token scan.
   * - Never returns CPF or sensitive PII.
   * - Logs every access for audit/antifraude.
   * - Rate-limits: max 15 scans per IP per 60 seconds.
   */
  async validateQr(
    tenantId: string,
    payload: { qrToken: string; vehicleId?: string; checkpoint?: string },
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

    const patient = await this.prisma.patient.findFirst({
      where: { tenantId, qrToken: payload.qrToken },
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
        address: true,
        lat: true,
        lng: true,
        qrToken: true,
        queues: {
          select: {
            destination: true,
            priority: true,
            status: true,
            appointmentDate: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!patient) throw new NotFoundException('QR token not found');
    if (!patient.qrActive) throw new ForbiddenException('This QR token has been deactivated');

    // Log the scan
    await this.prisma.patientQrAccessLog.create({
      data: {
        tenantId,
        patientId: patient.id,
        qrToken: payload.qrToken,
        ip: ip ?? null,
        device: device ?? null,
        vehicleId: payload.vehicleId ?? null,
        checkpoint: payload.checkpoint ?? null,
      },
    });

    // Update last read timestamp
    await this.prisma.patient.update({
      where: { id: patient.id },
      data: { qrLastReadAt: new Date() },
    });

    const activeQueue = patient.queues[0] ?? null;

    // Return only operationally relevant, non-sensitive fields
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
            destination: activeQueue.destination,
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
      data: { qrActive: false },
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
        ip: true,
        device: true,
        vehicleId: true,
        checkpoint: true,
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


