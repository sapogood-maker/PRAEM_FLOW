import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: OperationalFlowService,
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
          patient: { select: { id: true, name: true, cpf: true, mobility: true, requiresCompanion: true } },
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

  async board(id: string, tenantId: string) {
    this.logger.log(`[TRIP] board tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.confirmBoarding(tenantId, { tripId: id });
    return result.trip;
  }

  async inTransit(id: string, tenantId: string) {
    this.logger.log(`[TRIP] inTransit tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.startInTransit(tenantId, { tripId: id });
    return result.trip;
  }

  async arrived(id: string, tenantId: string) {
    this.logger.log(`[TRIP] arrived tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.markArrived(tenantId, { tripId: id });
    return result.trip;
  }

  async complete(id: string, tenantId: string) {
    this.logger.log(`[TRIP] complete tenantId=${tenantId} tripId=${id}`);
    const result = await this.flow.completeTrip(tenantId, { tripId: id });
    return result.trip;
  }

  async noShow(id: string, tenantId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.prisma.trip.update({ where: { id }, data: { status: 'NO_SHOW' } });
  }

  async cancel(id: string, tenantId: string) {
    const result = await this.flow.cancel(tenantId, { tripId: id });
    return result.trip;
  }
}
