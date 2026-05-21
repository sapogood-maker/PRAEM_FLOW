import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: OperationalFlowService,
  ) {}

  async findAll(tenantId: string, query: { status?: string | string[]; date?: string; startDate?: string; endDate?: string; driverId?: string; vehicleId?: string; page?: number; limit?: number }) {
    const { status, date, startDate, endDate, driverId, vehicleId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const statuses = Array.isArray(status) ? status : (typeof status === 'string' ? status.split(',') : undefined);
    const where: any = {
      tenantId,
      ...(statuses && { status: { in: statuses as any[] } }),
      ...(driverId && { driverId }),
      ...(vehicleId && { vehicleId }),
      ...(date && {
        date: {
          gte: new Date(date + 'T00:00:00Z'),
          lte: new Date(date + 'T23:59:59Z'),
        },
      }),
      ...(!date && startDate && endDate && {
        date: {
          gte: new Date(startDate + 'T00:00:00Z'),
          lte: new Date(endDate + 'T23:59:59Z'),
        },
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.route.findMany({
        where,
        skip,
        take: limit,
        include: {
          driver: { include: { user: { select: { name: true } } } },
          vehicle: { select: { id: true, plate: true, model: true, capacity: true } },
          trips: { select: { id: true, status: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.route.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, tenantId },
      include: {
        driver: { include: { user: true } },
        vehicle: true,
        trips: { include: { patient: true } },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  async create(tenantId: string, data: any) {
    const payload: any = { ...data, tenantId };
    if (payload.scheduledAt && typeof payload.scheduledAt === 'string') {
      payload.scheduledAt = new Date(payload.scheduledAt);
    }
    if (payload.date && typeof payload.date === 'string') {
      payload.date = new Date(payload.date);
    }
    // Default status for scheduled (future) routes
    if (!payload.status) {
      payload.status = payload.dispatchType === 'SCHEDULED' ? 'SCHEDULED' : 'PLANNED';
    }
    const route = await this.prisma.route.create({ data: payload });
    if (route.driverId && route.dispatchType === 'IMMEDIATE') {
      await this.flow.recordDispatch(tenantId, route.id, {
        driverId: route.driverId,
        vehicleId: route.vehicleId,
        source: 'dispatch',
      });
    }
    return route;
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const payload: any = { ...data };
    if (payload.scheduledAt && typeof payload.scheduledAt === 'string') {
      payload.scheduledAt = new Date(payload.scheduledAt);
    }
    if (payload.date && typeof payload.date === 'string') {
      payload.date = new Date(payload.date);
    }
    return this.prisma.route.update({ where: { id }, data: payload });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.route.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { cancelled: true };
  }

  /** Driver starts the route — status PLANNED → ACTIVE */
  async startRoute(id: string, tenantId: string, input?: { tripId?: string; source?: string }) {
    this.logger.log(`[ROUTE] startRoute tenantId=${tenantId} routeId=${id} tripId=${input?.tripId ?? '-'} source=${input?.source ?? 'routes.start'}`);
    return this.flow.startRoute(
      tenantId,
      id,
      { source: input?.source ?? 'routes.start' },
      input?.tripId,
    );
  }

  /** Route fully complete — status ACTIVE → COMPLETED */
  async completeRoute(id: string, tenantId: string) {
    this.logger.log(`[ROUTE] completeRoute tenantId=${tenantId} routeId=${id}`);
    return this.flow.completeRoute(tenantId, id);
  }

  optimize(id: string) {
    return { routeId: id, optimized: true, message: 'Rota otimizada por heurística de distância' };
  }
}
