import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerateQrPayloadDto, QrCheckpoint } from './dto/generate-qr-payload.dto';
import { ValidateQrPayloadDto } from './dto/validate-qr-payload.dto';

type QrPayload = {
  version: number;
  uniqueId: string;
  secureHash: string;
  signature: string;
  operationReference: string;
  patientReference: string;
  checkpoint: QrCheckpoint;
  expiration: string;
  issuedAt: string;
  tripId?: string | null;
  routeId?: string | null;
  patientId: string;
  boardingCode: string;
  expiresAt: string;
};

const CHECKPOINTS: QrCheckpoint[] = ['CHECK_IN', 'BOARDING', 'ARRIVAL'];

@Injectable()
export class QrEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePayload(tenantId: string, body: GenerateQrPayloadDto) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: body.patientId, tenantId },
      select: { id: true, name: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const checkpoint = this.normalizeCheckpoint(body.checkpoint);
    const validityMinutes = this.normalizeValidityMinutes(body.validityMinutes);
    const issuedAt = new Date();
    const expiration = new Date(issuedAt.getTime() + validityMinutes * 60_000);
    const operationReference = body.operationReference ?? body.tripId ?? body.routeId ?? `OPS-${randomUUID()}`;

    const unsigned: Omit<QrPayload, 'secureHash' | 'signature'> = {
      version: 1,
      uniqueId: randomUUID(),
      operationReference,
      patientReference: body.patientId,
      checkpoint,
      expiration: expiration.toISOString(),
      issuedAt: issuedAt.toISOString(),
      tripId: body.tripId ?? null,
      routeId: body.routeId ?? null,
      patientId: body.patientId,
      boardingCode: operationReference,
      expiresAt: expiration.toISOString(),
    };
    const signature = this.sign(unsigned);
    const payload: QrPayload = {
      ...unsigned,
      secureHash: signature,
      signature,
    };

    return {
      valid: true,
      payload,
      qrContent: JSON.stringify(payload),
      patient,
      validityMinutes,
    };
  }

  async validatePayload(tenantId: string, body: ValidateQrPayloadDto) {
    const payload = this.parsePayload(body);
    const normalized = this.normalizePayload(payload);

    if (!normalized.uniqueId || !normalized.patientReference || !normalized.operationReference || !normalized.expiration || !normalized.signature) {
      throw new BadRequestException('QR payload is incomplete');
    }

    const expiration = new Date(normalized.expiration);
    if (Number.isNaN(expiration.getTime())) {
      throw new BadRequestException('QR payload has invalid expiration');
    }
    if (expiration.getTime() <= Date.now()) {
      throw new BadRequestException('QR payload expired');
    }

    const expectedCheckpoint = body.expectedCheckpoint ? this.normalizeCheckpoint(body.expectedCheckpoint) : null;
    if (expectedCheckpoint && normalized.checkpoint !== expectedCheckpoint) {
      throw new BadRequestException(`QR checkpoint mismatch: expected ${expectedCheckpoint}, got ${normalized.checkpoint}`);
    }

    const expectedSignature = normalized.format === 'legacy'
      ? this.signLegacy({
          tripId: normalized.tripId,
          patientId: normalized.patientReference,
          boardingCode: normalized.operationReference,
          expiresAt: normalized.expiration,
        })
      : this.sign({
          version: 1,
          uniqueId: normalized.uniqueId,
          operationReference: normalized.operationReference,
          patientReference: normalized.patientReference,
          checkpoint: normalized.checkpoint,
          expiration: normalized.expiration,
          issuedAt: normalized.issuedAt ?? new Date().toISOString(),
          tripId: normalized.tripId,
          routeId: normalized.routeId,
          patientId: normalized.patientReference,
          boardingCode: normalized.operationReference,
          expiresAt: normalized.expiration,
        });

    if (!this.constantTimeEquals(expectedSignature, normalized.signature)) {
      throw new BadRequestException('QR signature mismatch');
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: normalized.patientReference, tenantId },
      select: { id: true, name: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    return {
      valid: true,
      payload: normalized,
      patient,
    };
  }

  private parsePayload(body: ValidateQrPayloadDto): Record<string, any> {
    if (body.payload && typeof body.payload === 'object') {
      return body.payload;
    }
    if (!body.token) {
      throw new BadRequestException('Either token or payload must be provided');
    }
    try {
      const parsed = JSON.parse(body.token);
      if (!parsed || typeof parsed !== 'object') {
        throw new BadRequestException('QR token must decode to object payload');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Invalid QR token format');
    }
  }

  private normalizePayload(payload: Record<string, any>) {
    const uniqueId = payload.uniqueId?.toString() ?? payload.id?.toString() ?? null;
    const patientReference = payload.patientReference?.toString() ?? payload.patientId?.toString() ?? null;
    const operationReference = payload.operationReference?.toString() ?? payload.boardingCode?.toString() ?? payload.operationRef?.toString() ?? null;
    const expiration = payload.expiration?.toString() ?? payload.expiresAt?.toString() ?? null;
    const signature = payload.secureHash?.toString() ?? payload.signature?.toString() ?? null;
    const checkpoint = this.normalizeCheckpoint(payload.checkpoint);

    return {
      format: uniqueId ? 'v1' : 'legacy',
      uniqueId: uniqueId ?? `${payload.tripId ?? 'trip'}:${patientReference ?? 'patient'}:${operationReference ?? 'op'}`,
      patientReference,
      operationReference,
      expiration,
      signature,
      checkpoint,
      tripId: payload.tripId?.toString() ?? null,
      routeId: payload.routeId?.toString() ?? null,
      issuedAt: payload.issuedAt?.toString() ?? null,
    };
  }

  private normalizeCheckpoint(value: unknown): QrCheckpoint {
    const checkpoint = String(value ?? 'BOARDING').trim().toUpperCase() as QrCheckpoint;
    if (!CHECKPOINTS.includes(checkpoint)) {
      throw new BadRequestException(`Unsupported checkpoint: ${checkpoint}`);
    }
    return checkpoint;
  }

  private normalizeValidityMinutes(value?: number) {
    const validity = Number(value ?? 24 * 60);
    if (!Number.isFinite(validity) || validity <= 0) {
      throw new BadRequestException('validityMinutes must be a positive number');
    }
    return Math.min(Math.round(validity), 30 * 24 * 60);
  }

  private sign(payload: Omit<QrPayload, 'secureHash' | 'signature'>) {
    const canonical = [
      payload.uniqueId,
      payload.patientReference,
      payload.operationReference,
      payload.checkpoint,
      payload.expiration,
      payload.tripId ?? '',
      payload.routeId ?? '',
    ].join('|');
    return createHmac('sha256', this.secret()).update(canonical).digest('hex');
  }

  private signLegacy(payload: { tripId?: string | null; patientId?: string | null; boardingCode?: string | null; expiresAt?: string | null }) {
    const canonical = [
      payload.tripId ?? '',
      payload.patientId ?? '',
      payload.boardingCode ?? '',
      payload.expiresAt ?? '',
    ].join('|');
    return createHmac('sha256', this.secret()).update(canonical).digest('hex');
  }

  private secret() {
    return process.env.QR_HMAC_SECRET ?? process.env.OFFLINE_QR_SECRET ?? process.env.JWT_SECRET ?? 'change_me_qr_secret';
  }

  private constantTimeEquals(a: string, b: string) {
    if (a.length !== b.length) return false;
    let out = 0;
    for (let i = 0; i < a.length; i += 1) {
      out |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return out === 0;
  }
}

