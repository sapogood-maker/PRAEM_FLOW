import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TripStopsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTrip(tenantId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.prisma.tripStop.findMany({
      where: { tripId, tenantId },
      include: { location: { select: { id: true, name: true, city: true, type: true, latitude: true, longitude: true } } },
      orderBy: { sequence: 'asc' },
    });
  }

  async create(
    tenantId: string,
    tripId: string,
    data: {
      sequence: number;
      type: string;
      name: string;
      locationId?: string;
      lat?: number;
      lng?: number;
      plannedArrival?: string;
      notes?: string;
    },
  ) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');
    return this.prisma.tripStop.create({
      data: {
        tenantId,
        tripId,
        sequence: data.sequence,
        type: data.type as any,
        name: data.name,
        ...(data.locationId && { locationId: data.locationId }),
        ...(data.lat !== undefined && { lat: data.lat }),
        ...(data.lng !== undefined && { lng: data.lng }),
        ...(data.plannedArrival && { plannedArrival: new Date(data.plannedArrival) }),
        ...(data.notes && { notes: data.notes }),
        status: 'PENDING',
      },
    });
  }

  async updateStatus(
    tenantId: string,
    stopId: string,
    status: 'EN_ROUTE' | 'ARRIVED' | 'BOARDING' | 'COMPLETED' | 'SKIPPED',
  ) {
    const stop = await this.prisma.tripStop.findFirst({ where: { id: stopId, tenantId } });
    if (!stop) throw new NotFoundException('TripStop not found');
    return this.prisma.tripStop.update({
      where: { id: stopId },
      data: {
        status,
        ...(status === 'ARRIVED' && { actualArrival: new Date() }),
      },
    });
  }

  async findCurrentStop(tenantId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId } });
    if (!trip) throw new NotFoundException('Trip not found');

    // Current = first non-completed, non-skipped stop
    const current = await this.prisma.tripStop.findFirst({
      where: { tripId, tenantId, status: { notIn: ['COMPLETED', 'SKIPPED'] } },
      include: { location: true },
      orderBy: { sequence: 'asc' },
    });

    // Next = the one after current
    const next = current
      ? await this.prisma.tripStop.findFirst({
          where: { tripId, tenantId, sequence: { gt: current.sequence }, status: { notIn: ['COMPLETED', 'SKIPPED'] } },
          include: { location: true },
          orderBy: { sequence: 'asc' },
        })
      : null;

    return { current, next };
  }

  async remove(tenantId: string, stopId: string) {
    const stop = await this.prisma.tripStop.findFirst({ where: { id: stopId, tenantId } });
    if (!stop) throw new NotFoundException('TripStop not found');
    return this.prisma.tripStop.delete({ where: { id: stopId } });
  }
}
