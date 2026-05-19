import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../gateways/realtime.gateway';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
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
    const trip = await this.prisma.trip.findFirst({
      where: { id, tenantId },
      include: { patient: { select: { name: true, operationalId: true } }, route: { select: { driverId: true, vehicleId: true } } },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: 'BOARDING', qrScanned: true, boardedAt: new Date() },
    });
    this.gateway.emitToTenant(tenantId, 'patient:boarded', {
      tripId: id,
      patientId: trip.patientId,
      patientName: trip.patient?.name,
      operationalId: trip.patient?.operationalId,
      routeId: trip.routeId,
      driverId: trip.route?.driverId,
      vehicleId: trip.route?.vehicleId,
      boardedAt: updated.boardedAt,
      status: 'BOARDING',
    });
    return updated;
  }

  async complete(id: string, tenantId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { id, tenantId },
      include: { route: { select: { driverId: true, vehicleId: true } } },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    const updated = await this.prisma.trip.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    this.gateway.emitToTenant(tenantId, 'trip:completed', {
      tripId: id,
      patientId: trip.patientId,
      routeId: trip.routeId,
      driverId: trip.route?.driverId,
      vehicleId: trip.route?.vehicleId,
      completedAt: updated.completedAt,
    });
    return updated;
  }

  async noShow(id: string, tenantId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.prisma.trip.update({ where: { id }, data: { status: 'NO_SHOW' } });
  }

  async cancel(id: string, tenantId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.prisma.trip.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
}
