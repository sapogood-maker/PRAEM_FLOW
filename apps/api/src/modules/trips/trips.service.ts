import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: OperationalFlowService,
    @Optional() private readonly whatsapp?: WhatsappService,
  ) {}

  async findAll(tenantId: string, query: { routeId?: string; status?: string; page?: number; limit?: number }) {
    const { routeId, status, page = 1, limit = 30 } = query;
    const skip = (page - 1) * limit;
    const where = {
      tenantId,
      ...(routeId && { routeId }),
      ...(status && { status: status as any }),
    };
    const [items, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        skip,
        take: limit,
        include: {
          patient: { select: { id: true, name: true, cpf: true, mobility: true, requiresCompanion: true, lat: true, lng: true, address: true } },
          route: { select: { id: true, origin: true, destination: true, date: true } },
        },
        orderBy: { boardedAt: 'desc' },
      }),
      this.prisma.trip.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async create(tenantId: string, data: { routeId: string; patientId: string; notes?: string }) {
    return this.prisma.trip.create({
      data: { tenantId, ...data, status: 'SCHEDULED', qrScanned: false },
    });
  }

  async board(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    this.logger.log(`[TRIP] board tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.confirmBoarding(tenantId, { tripId: id }, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'TRIP_MANUAL_BOARD',
    });
    return result.trip;
  }

  async boarded(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    this.logger.log(`[TRIP] boarded tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.markBoarded(tenantId, { tripId: id }, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'TRIP_BOARDED',
    });

    // [WHATSAPP] Confirm boarding to patient
    if (this.whatsapp && result.trip) {
      const trip = result.trip as { patientId?: string; routeId?: string };
      if (trip.patientId) {
        this.whatsapp.notifyBoardingConfirmed(tenantId, trip.patientId, id).catch((err) =>
          this.logger.warn(`[WHATSAPP] notifyBoardingConfirmed failed tripId=${id}: ${err}`),
        );
      }
    }

    return result.trip;
  }

  async inTransit(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    this.logger.log(`[TRIP] inTransit tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.startInTransit(tenantId, { tripId: id }, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'TRIP_IN_TRANSIT',
    });
    return result.trip;
  }

  async arrived(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    this.logger.log(`[TRIP] arrived tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.markArrived(tenantId, { tripId: id }, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'TRIP_ARRIVED',
    });
    return result.trip;
  }

  async complete(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    this.logger.log(`[TRIP] complete tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.completeTrip(tenantId, { tripId: id }, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'TRIP_COMPLETED',
    });

    // [WHATSAPP] Notify patient of trip completion
    if (this.whatsapp && result.trip) {
      const trip = result.trip as { patientId?: string };
      if (trip.patientId) {
        this.whatsapp.notifyTripCompleted(tenantId, trip.patientId, id).catch((err) =>
          this.logger.warn(`[WHATSAPP] notifyTripCompleted failed tripId=${id}: ${err}`),
        );
      }
    }

    return result.trip;
  }

  async noShow(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    const trip = await this.prisma.trip.findFirst({ where: { id, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    const result = await this.flow.markNoShow(tenantId, { tripId: id }, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'TRIP_NO_SHOW',
    });

    // [WHATSAPP] Notify patient of no-show
    if (this.whatsapp && trip.patientId) {
      this.whatsapp.notifyNoShow(tenantId, trip.patientId, id).catch((err) =>
        this.logger.warn(`[WHATSAPP] notifyNoShow failed tripId=${id}: ${err}`),
      );
    }

    return result.trip;
  }

  async reinstate(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    this.logger.log(`[TRIP] reinstate tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.reinstateTrip(tenantId, id, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'TRIP_REINSTATE',
    });
    return result.trip;
  }

  async recoverStale(tenantId: string, cutoffHours?: number, context?: { driverId?: string; actorUserId?: string }) {
    return this.flow.recoverStaleTrips(tenantId, cutoffHours ?? 12, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'TRIP_RECOVERY_STALE',
    });
  }

  async cancel(id: string, tenantId: string) {
    const result = await this.flow.cancel(tenantId, { tripId: id });
    return result.trip;
  }
}
