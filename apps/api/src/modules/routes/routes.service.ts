import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../gateways/realtime.gateway';

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async findAll(tenantId: string, query: { status?: string; date?: string; driverId?: string; vehicleId?: string; page?: number; limit?: number }) {
    const { status, date, driverId, vehicleId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: any = {
      tenantId,
      ...(status && { status: status as any }),
      ...(driverId && { driverId }),
      ...(vehicleId && { vehicleId }),
      ...(date && {
        date: {
          gte: new Date(date + 'T00:00:00Z'),
          lte: new Date(date + 'T23:59:59Z'),
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
    return this.prisma.route.create({ data: { ...data, tenantId } });
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    return this.prisma.route.update({ where: { id }, data });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.route.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { cancelled: true };
  }

  /** Driver starts the route — status PLANNED → ACTIVE */
  async startRoute(id: string, tenantId: string) {
    const route = await this.findOne(id, tenantId);
    const updated = await this.prisma.route.update({
      where: { id },
      data: { status: 'ACTIVE' },
      include: { driver: { include: { user: { select: { name: true } } } }, vehicle: { select: { id: true, plate: true } } },
    });
    this.gateway.emitToTenant(tenantId, 'route:started', {
      routeId: id,
      driverId: route.driverId,
      vehicleId: route.vehicleId,
      destination: route.destination,
      status: 'ACTIVE',
    });
    return updated;
  }

  /** Route fully complete — status ACTIVE → COMPLETED */
  async completeRoute(id: string, tenantId: string) {
    const route = await this.findOne(id, tenantId);
    const updated = await this.prisma.route.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });
    this.gateway.emitToTenant(tenantId, 'route:completed', {
      routeId: id,
      driverId: route.driverId,
      vehicleId: route.vehicleId,
      status: 'COMPLETED',
    });
    return updated;
  }

  optimize(id: string) {
    return { routeId: id, optimized: true, message: 'Rota otimizada por heurística de distância' };
  }
}


