import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../gateways/realtime.gateway';

export type TokenType = 'CONFIRMATION' | 'BOARDING' | 'RETURN' | 'REBOOK';

const TOKEN_TTL_MINUTES: Record<TokenType, number> = {
  CONFIRMATION: 48 * 60,   // 48h
  BOARDING: 30 * 24 * 60,  // 30 days — operational tokens remain valid throughout trip lifecycle
  RETURN: 8 * 60,          // 8h
  REBOOK: 24 * 60,         // 24h
};

@Injectable()
export class TripTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
  ) {}

  /** Gera um token operacional para uma viagem. */
  async generate(tenantId: string, tripId: string, type: TokenType) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId },
      include: { patient: { select: { id: true, name: true } } },
    });
    if (!trip) throw new NotFoundException('Viagem não encontrada');

    const ttl = TOKEN_TTL_MINUTES[type] ?? 60;
    const expiresAt = new Date(Date.now() + ttl * 60_000);
    const token = randomUUID();

    const created = await this.prisma.tripToken.create({
      data: {
        tenantId,
        tripId,
        patientId: trip.patientId,
        token,
        type,
        expiresAt,
      },
    });

    return {
      id: created.id,
      token: created.token,
      type: created.type,
      expiresAt: created.expiresAt,
      url: `/t/${created.token}`,
      patientName: trip.patient?.name,
    };
  }

  /** Lista tokens de uma viagem. */
  async listByTrip(tenantId: string, tripId: string) {
    return this.prisma.tripToken.findMany({
      where: { tenantId, tripId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Retorna os dados públicos de um token (sem autenticação). */
  async getPublic(token: string) {
    const record = await this.prisma.tripToken.findUnique({
      where: { token },
      include: {
        trip: {
          select: {
            id: true,
            status: true,
            route: {
              select: {
                id: true,
                origin: true,
                destination: true,
                date: true,
                scheduledAt: true,
              },
            },
          },
        },
        patient: { select: { id: true, name: true } },
      },
    });

    if (!record) throw new NotFoundException('Token não encontrado');
    if (record.usedAt) throw new BadRequestException('Token já utilizado');

    // [QR] Validate token based on trip status and token type
    const activeStatuses = ['SCHEDULED', 'CONFIRMED', 'BOARDING', 'IN_PROGRESS', 'ARRIVED'];
    const terminalStatuses = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];

    if (record.type === 'BOARDING') {
      // Boarding tokens valid while trip is active
      if (terminalStatuses.includes(record.trip.status)) {
        console.log(`[QR] Token ${token.substring(0, 8)}… rejected: trip in terminal status ${record.trip.status}`);
        throw new BadRequestException('Viagem finalizada — QR inválido');
      }
      console.log(`[QR] Token ${token.substring(0, 8)}… validated: trip status=${record.trip.status}, type=BOARDING`);
    } else {
      // Other tokens use time-based expiration
      if (record.expiresAt < new Date()) {
        console.log(`[QR] Token ${token.substring(0, 8)}… expired: ${record.expiresAt.toISOString()}, type=${record.type}`);
        throw new BadRequestException('Token expirado');
      }
      console.log(`[QR] Token ${token.substring(0, 8)}… validated: expires=${record.expiresAt.toISOString()}, type=${record.type}`);
    }

    return {
      id: record.id,
      type: record.type,
      expiresAt: record.expiresAt,
      patient: record.patient,
      trip: record.trip,
    };
  }

  /** Consome/usa um token (marca como utilizado e dispara ação operacional). */
  async use(
    token: string,
    action: { ip?: string; gpsLat?: number; gpsLng?: number; deviceInfo?: string },
  ) {
    const record = await this.prisma.tripToken.findUnique({
      where: { token },
      include: {
        trip: { select: { id: true, status: true, tenantId: true, routeId: true, patientId: true } },
        patient: { select: { name: true } },
      },
    });

    if (!record) throw new NotFoundException('Token não encontrado');
    if (record.usedAt) throw new BadRequestException('Token já utilizado');

    // [QR] Validate token based on trip status and token type
    const activeStatuses = ['SCHEDULED', 'CONFIRMED', 'BOARDING', 'IN_PROGRESS', 'ARRIVED'];
    const terminalStatuses = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];

    if (record.type === 'BOARDING') {
      // Boarding tokens can be validated for identity, but cannot auto-board.
      if (terminalStatuses.includes(record.trip.status)) {
        console.log(`[QR] Use rejected: trip in terminal status ${record.trip.status}, token=${token.substring(0, 8)}…`);
        throw new BadRequestException('Viagem finalizada — QR inválido');
      }
      throw new BadRequestException('Confirmação de embarque deve ser feita pelo motorista (QR do app do motorista ou confirmação manual)');
    } else {
      // Other tokens use time-based expiration
      if (record.expiresAt < new Date()) {
        console.log(`[QR] Use rejected: token expired (${record.expiresAt.toISOString()}), type=${record.type}, token=${token.substring(0, 8)}…`);
        throw new BadRequestException('Token expirado');
      }
      console.log(`[QR] Use accepted: token valid (expires ${record.expiresAt.toISOString()}), type=${record.type}, token=${token.substring(0, 8)}…`);
    }

    const now = new Date();
    const gpsStr = action.gpsLat != null && action.gpsLng != null
      ? `${action.gpsLat},${action.gpsLng}`
      : null;

    // Mark as used
    await this.prisma.tripToken.update({
      where: { token },
      data: {
        usedAt: now,
        usedByIp: action.ip ?? null,
        usedByGps: gpsStr,
        deviceInfo: action.deviceInfo ?? null,
      },
    });

    const tenantId = record.trip.tenantId;
    const tripId = record.trip.id;

    // Apply operational action based on token type
    switch (record.type) {
      case 'CONFIRMATION':
        await this.prisma.trip.update({
          where: { id: tripId },
          data: { status: 'CONFIRMED' },
        });
        this.gateway.emitToTenant(tenantId, 'trip:confirmed', {
          tripId,
          patientId: record.patientId,
          patientName: record.patient?.name,
          confirmedAt: now,
        });
        break;

      case 'RETURN':
        await this.prisma.trip.update({
          where: { id: tripId },
          data: { status: 'IN_PROGRESS' },
        });
        this.gateway.emitToTenant(tenantId, 'trip:returning', {
          tripId,
          patientId: record.patientId,
          returnAt: now,
        });
        break;

      case 'REBOOK':
        // Apenas notifica — reagendamento requer fluxo web
        this.gateway.emitToTenant(tenantId, 'trip:rebook_requested', {
          tripId,
          patientId: record.patientId,
          requestedAt: now,
        });
        break;
    }

    return { success: true, type: record.type, usedAt: now };
  }
}
