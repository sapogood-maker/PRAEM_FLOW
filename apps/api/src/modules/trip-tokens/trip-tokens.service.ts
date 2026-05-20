import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../gateways/realtime.gateway';

export type TokenType = 'CONFIRMATION' | 'BOARDING' | 'RETURN' | 'REBOOK';

const TOKEN_TTL_MINUTES: Record<TokenType, number> = {
  CONFIRMATION: 48 * 60, // 48h
  BOARDING: 4 * 60,      // 4h
  RETURN: 8 * 60,        // 8h
  REBOOK: 24 * 60,       // 24h
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
    if (record.expiresAt < new Date()) throw new BadRequestException('Token expirado');

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
    if (record.expiresAt < new Date()) throw new BadRequestException('Token expirado');

    const now = new Date();
    const gpsStr = action.gpsLat != null && action.gpsLng != null
      ? `${action.gpsLat},${action.gpsLng}`
      : null;

    // Marcar como utilizado
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

    // Aplicar ação operacional de acordo com o tipo do token
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

      case 'BOARDING':
        await this.prisma.trip.update({
          where: { id: tripId },
          data: { status: 'BOARDING', boardedAt: now, qrScanned: true },
        });
        this.gateway.emitToTenant(tenantId, 'patient:boarded', {
          tripId,
          patientId: record.patientId,
          patientName: record.patient?.name,
          boardedAt: now,
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
