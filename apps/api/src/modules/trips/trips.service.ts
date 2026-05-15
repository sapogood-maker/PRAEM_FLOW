import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

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
    const trip = await this.prisma.trip.findFirst({ where: { id, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.prisma.trip.update({
      where: { id },
      data: { status: 'BOARDED', qrScanned: true, boardedAt: new Date() },
    });
  }

  async complete(id: string, tenantId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.prisma.trip.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
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
