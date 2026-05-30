import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GenerateQrPayloadDto, QrCheckpoint } from './dto/generate-qr-payload.dto';
import { ValidateQrPayloadDto } from './dto/validate-qr-payload.dto';
import { buildPatientQrPayload, buildTripQrPayload, issueQrToken } from '../../common/qr-payload';

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
    const validityMinutes = this.normalizeValidityMinutes(body.validityMinutes);
    const issuedAt = new Date();
    const expiration = new Date(issuedAt.getTime() + validityMinutes * 60_000);
    const kind = String(body.kind ?? (body.tripId ? 'TRIP' : 'PATIENT')).toUpperCase() as 'PATIENT' | 'TRIP';

    if (kind === 'TRIP' || body.tripId) {
      const trip = await this.prisma.trip.findFirst({
        where: { id: body.tripId, tenantId },
        include: {
          route: { select: { id: true, destination: true } },
          patient: { select: { id: true, name: true, praemId: true, operationalId: true } },
        },
      });
      if (!trip) throw new NotFoundException('Trip not found');

      const validationToken = body.validationToken ?? issueQrToken();
      const payload = buildTripQrPayload({
        tripId: trip.id,
        patientId: trip.patientId,
        routeId: trip.routeId,
        operationId: body.operationReference ?? trip.routeId,
        validationToken,
        issuedAt,
        expiresAt: expiration,
      });

      return {
        valid: true,
        payload,
        qrContent: JSON.stringify(payload),
        trip,
        validityMinutes,
      };
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: body.patientId, tenantId },
      select: { id: true, name: true, praemId: true, operationalId: true, qrToken: true, qrIssuedAt: true, qrExpiresAt: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const validationToken = body.validationToken ?? patient.qrToken ?? issueQrToken();
    const payload = buildPatientQrPayload({
      patientId: patient.id,
      praemId: patient.praemId ?? patient.operationalId ?? `PRAEM-${patient.id.replace(/-/g, '').slice(-6)}`,
      validationToken,
      issuedAt: patient.qrIssuedAt ?? issuedAt,
      expiresAt: patient.qrExpiresAt ?? null,
    });

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

    if (normalized.kind === 'PATIENT' || normalized.kind === 'TRIP') {
      const isTrip = normalized.kind === 'TRIP';
      if (!normalized.validationToken || !normalized.secureHash) {
        throw new BadRequestException('QR payload is incomplete');
      }
      if (isTrip && !normalized.tripId) {
        throw new BadRequestException('QR payload is incomplete');
      }
      if (isTrip && !normalized.expiresAt) {
        throw new BadRequestException('QR payload is incomplete');
      }
      if (!isTrip && !normalized.patientId && !normalized.praemId) {
        throw new BadRequestException('QR payload is incomplete');
      }
      const expectedCheckpoint = body.expectedCheckpoint ? this.normalizeCheckpoint(body.expectedCheckpoint) : null;
      if (expectedCheckpoint && normalized.checkpoint && normalized.checkpoint !== expectedCheckpoint) {
        throw new BadRequestException(`QR checkpoint mismatch: expected ${expectedCheckpoint}, got ${normalized.checkpoint}`);
      }

      if (isTrip) {
        const trip = await this.prisma.trip.findFirst({
          where: { tenantId, id: normalized.tripId },
          include: { patient: { select: { id: true, name: true, praemId: true, operationalId: true } }, route: { select: { id: true, destination: true } } },
        });
        if (!trip) throw new NotFoundException('Trip not found');

        const expected = buildTripQrPayload({
          tripId: trip.id,
          patientId: trip.patientId,
          routeId: trip.routeId,
          operationId: normalized.operationId ?? trip.routeId,
          validationToken: normalized.validationToken,
          issuedAt: new Date(normalized.issuedAt ?? new Date().toISOString()),
          expiresAt: new Date(normalized.expiresAt),
        });
        if (!this.constantTimeEquals(expected.secure_hash, normalized.secureHash)) {
          throw new BadRequestException('QR signature mismatch');
        }

        return {
          valid: true,
          payload: normalized,
          patient: trip.patient,
          trip,
        };
      }

      const patient = await this.prisma.patient.findFirst({
        where: {
          tenantId,
          OR: [
            ...(normalized.patientId ? [{ id: normalized.patientId }] : []),
            ...(normalized.praemId ? [{ praemId: normalized.praemId }] : []),
          ],
        },
        select: { id: true, name: true, praemId: true, operationalId: true, qrToken: true, qrIssuedAt: true, qrExpiresAt: true },
      });
      if (!patient) throw new NotFoundException('Patient not found');

      const expected = buildPatientQrPayload({
        patientId: patient.id,
        praemId: patient.praemId ?? patient.operationalId ?? patient.id,
        validationToken: normalized.validationToken,
        issuedAt: patient.qrIssuedAt ?? new Date(),
        expiresAt: patient.qrExpiresAt ?? null,
      });
      if (!this.constantTimeEquals(expected.secure_hash, normalized.secureHash)) {
        throw new BadRequestException('QR signature mismatch');
      }

      return {
        valid: true,
        payload: normalized,
        patient,
      };
    }

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
          checkpoint: normalized.checkpoint ?? 'BOARDING',
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
    const kindRaw = String(payload.type ?? payload.kind ?? '').trim().toUpperCase();
    const patientId = payload.patient_id?.toString() ?? payload.patientId?.toString() ?? payload.patientReference?.toString() ?? null;
    const praemId = payload.praem_id?.toString() ?? payload.praemId?.toString() ?? null;
    const tripId = payload.trip_id?.toString() ?? payload.tripId?.toString() ?? null;
    const routeId = payload.route_id?.toString() ?? payload.routeId?.toString() ?? null;
    const operationId = payload.operation_id?.toString() ?? payload.operationId?.toString() ?? null;
    const validationToken = payload.validation_token?.toString() ?? payload.validationToken?.toString() ?? payload.qrToken?.toString() ?? null;
    const secureHash = payload.secure_hash?.toString() ?? payload.secureHash?.toString() ?? payload.signature?.toString() ?? null;
    const expiresAt = payload.expires_at?.toString() ?? payload.expiresAt?.toString() ?? null;

    if (kindRaw === 'PATIENT' || kindRaw === 'TRIP' || patientId || tripId || routeId) {
      return {
        kind: kindRaw === 'TRIP' || tripId ? 'TRIP' : 'PATIENT',
        patientId,
        praemId,
        tripId,
        routeId,
        operationId,
        validationToken,
        secureHash,
        expiresAt,
        checkpoint: payload.checkpoint ? this.normalizeCheckpoint(payload.checkpoint) : null,
        issuedAt: payload.issued_at?.toString() ?? payload.issuedAt?.toString() ?? null,
      };
    }

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
