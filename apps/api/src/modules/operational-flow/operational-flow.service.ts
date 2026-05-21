import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsGateway } from '../../gateways/operations.gateway';

type FlowScope = {
  routeId?: string;
  tripId?: string;
  patientId?: string;
};

type FlowContext = {
  vehicleId?: string | null;
  driverId?: string | null;
  deviceId?: string | null;
  checkpoint?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  source?: string | null;
};

const TERMINAL_TRIP_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

@Injectable()
export class OperationalFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: OperationsGateway,
  ) {}

  async startRoute(tenantId: string, routeId: string, context: FlowContext = {}) {
    const route = await this.findRoute(tenantId, routeId);
    const updated = await this.prisma.route.update({
      where: { id: route.id },
      data: { status: 'ACTIVE' },
      include: {
        driver: { include: { user: { select: { name: true } } } },
        vehicle: { select: { id: true, plate: true, model: true, capacity: true } },
      },
    });

    this.emitToRoute(updated.tenantId, updated.driverId, 'route:started', {
      routeId: updated.id,
      driverId: updated.driverId,
      vehicleId: updated.vehicleId,
      status: updated.status,
      timestamp: new Date().toISOString(),
      source: context.source ?? 'api',
    });

    return updated;
  }

  async completeRoute(tenantId: string, routeId: string, context: FlowContext = {}) {
    const route = await this.findRoute(tenantId, routeId);
    const updated = await this.prisma.route.update({
      where: { id: route.id },
      data: { status: 'COMPLETED' },
    });

    this.emitToRoute(updated.tenantId, updated.driverId, 'route:completed', {
      routeId: updated.id,
      driverId: updated.driverId,
      vehicleId: updated.vehicleId,
      status: updated.status,
      timestamp: new Date().toISOString(),
      source: context.source ?? 'api',
    });

    return updated;
  }

  async confirmBoarding(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    const trip = await this.findTrip(tenantId, scope, ['SCHEDULED', 'CONFIRMED']);
    const now = new Date();
    const route = trip.route;
    const queue = await this.findLatestQueue(tenantId, trip.patientId);

    const updatedTrip = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { status: 'BOARDING', qrScanned: true, boardedAt: now },
    });

    if (queue) {
      await this.prisma.operationalQueue.update({
        where: { id: queue.id },
        data: { status: 'BOARDING', boardedAt: now, confirmationStatus: 'CONFIRMED', confirmedAt: now },
      });
    }

    const updatedRoute = await this.prisma.route.update({
      where: { id: route.id },
      data: { status: 'ACTIVE' },
    });

    const payload = this.buildPayload({
      trip: updatedTrip,
      route: updatedRoute,
      queueStatus: 'BOARDING',
      timestamp: now,
      context,
      queueId: queue?.id,
      patientName: trip.patient?.name,
      operationalId: trip.patient?.operationalId,
    });

    this.emitToRoute(updatedRoute.tenantId, updatedRoute.driverId, 'trip:boarding', payload);
    this.emitToRoute(updatedRoute.tenantId, updatedRoute.driverId, 'patient:boarded', payload);
    this.emitToRoute(updatedRoute.tenantId, updatedRoute.driverId, 'route.status_changed', {
      routeId: updatedRoute.id,
      status: updatedRoute.status,
      timestamp: now.toISOString(),
    });

    return { trip: updatedTrip, route: updatedRoute, queue };
  }

  async startInTransit(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    const trip = await this.findTrip(tenantId, scope, ['BOARDING', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS']);
    const now = new Date();
    const route = trip.route;
    const queue = await this.findLatestQueue(tenantId, trip.patientId);

    const updatedTrip = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { status: 'IN_PROGRESS' },
    });

    if (queue) {
      await this.prisma.operationalQueue.update({
        where: { id: queue.id },
        data: { status: 'IN_TRANSIT', departedAt: now },
      });
    }

    const payload = this.buildPayload({
      trip: updatedTrip,
      route,
      queueStatus: 'IN_TRANSIT',
      timestamp: now,
      context,
      queueId: queue?.id,
      patientName: trip.patient?.name,
      operationalId: trip.patient?.operationalId,
    });

    this.emitToRoute(route.tenantId, route.driverId, 'trip:started', payload);
    this.emitToRoute(route.tenantId, route.driverId, 'trip:in_transit', payload);
    this.emitToRoute(route.tenantId, route.driverId, 'route.status_changed', {
      routeId: route.id,
      status: route.status,
      timestamp: now.toISOString(),
    });

    return { trip: updatedTrip, route, queue };
  }

  async markArrived(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    const trip = await this.findTrip(tenantId, scope, ['IN_PROGRESS', 'BOARDING', 'SCHEDULED', 'CONFIRMED']);
    const now = new Date();
    const route = trip.route;
    const queue = await this.findLatestQueue(tenantId, trip.patientId);

    const updatedTrip = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { status: 'ARRIVED' },
    });

    if (queue) {
      await this.prisma.operationalQueue.update({
        where: { id: queue.id },
        data: { status: 'ARRIVED', arrivedAt: now },
      });
    }

    const payload = this.buildPayload({
      trip: updatedTrip,
      route,
      queueStatus: 'ARRIVED',
      timestamp: now,
      context,
      queueId: queue?.id,
      patientName: trip.patient?.name,
      operationalId: trip.patient?.operationalId,
    });

    this.emitToRoute(route.tenantId, route.driverId, 'trip:arrived', payload);
    this.emitToRoute(route.tenantId, route.driverId, 'patient.arrived', payload);
    this.emitToRoute(route.tenantId, route.driverId, 'route.status_changed', {
      routeId: route.id,
      status: route.status,
      timestamp: now.toISOString(),
    });

    return { trip: updatedTrip, route, queue };
  }

  async completeTrip(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    const trip = await this.findTrip(tenantId, scope, ['ARRIVED', 'IN_PROGRESS', 'BOARDING', 'SCHEDULED', 'CONFIRMED']);
    const now = new Date();
    const route = trip.route;
    const queue = await this.findLatestQueue(tenantId, trip.patientId);

    const updatedTrip = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { status: 'COMPLETED', completedAt: now },
    });

    if (queue) {
      await this.prisma.operationalQueue.update({
        where: { id: queue.id },
        data: { status: 'COMPLETED' },
      });
    }

    const remaining = await this.prisma.trip.count({
      where: {
        tenantId,
        routeId: route.id,
        status: { notIn: TERMINAL_TRIP_STATUSES as any[] },
      },
    });

    const routeStatus = remaining === 0 ? 'COMPLETED' : 'ACTIVE';
    const updatedRoute = remaining === 0
      ? await this.prisma.route.update({ where: { id: route.id }, data: { status: 'COMPLETED' } })
      : route;

    const payload = this.buildPayload({
      trip: updatedTrip,
      route: updatedRoute,
      queueStatus: 'COMPLETED',
      timestamp: now,
      context,
      queueId: queue?.id,
      patientName: trip.patient?.name,
      operationalId: trip.patient?.operationalId,
    });

    this.emitToRoute(updatedRoute.tenantId, updatedRoute.driverId, 'trip:completed', payload);
    this.emitToRoute(updatedRoute.tenantId, updatedRoute.driverId, 'patient.completed', payload);
    this.emitToRoute(updatedRoute.tenantId, updatedRoute.driverId, 'route.status_changed', {
      routeId: updatedRoute.id,
      status: routeStatus,
      timestamp: now.toISOString(),
    });
    if (remaining === 0) {
      this.emitToRoute(updatedRoute.tenantId, updatedRoute.driverId, 'route:completed', {
        routeId: updatedRoute.id,
        driverId: updatedRoute.driverId,
        vehicleId: updatedRoute.vehicleId,
        status: 'COMPLETED',
        timestamp: now.toISOString(),
      });
    }

    return { trip: updatedTrip, route: updatedRoute, queue, remaining };
  }

  private async findRoute(tenantId: string, routeId: string) {
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, tenantId },
      include: {
        driver: { include: { user: { select: { name: true } } } },
        vehicle: { select: { id: true, plate: true, model: true, capacity: true } },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    return route;
  }

  private async findTrip(tenantId: string, scope: FlowScope, statuses: string[]) {
    const trip = await this.prisma.trip.findFirst({
      where: {
        tenantId,
        ...(scope.tripId && { id: scope.tripId }),
        ...(scope.routeId && { routeId: scope.routeId }),
        ...(scope.patientId && { patientId: scope.patientId }),
        status: { in: statuses as any[] },
      },
      include: {
        route: {
          include: {
            driver: { include: { user: { select: { name: true } } } },
            vehicle: { select: { id: true, plate: true, model: true, capacity: true } },
          },
        },
        patient: { select: { id: true, name: true, operationalId: true } },
      },
      orderBy: [{ boardedAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  private async findLatestQueue(tenantId: string, patientId: string) {
    return this.prisma.operationalQueue.findFirst({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildPayload(params: {
    trip: { id: string; routeId: string; patientId: string; status: string; boardedAt?: Date | null; completedAt?: Date | null };
    route: { id: string; tenantId: string; driverId: string | null; vehicleId: string | null; status: string };
    queueStatus: string;
    queueId?: string | null;
    patientName?: string | null;
    operationalId?: string | null;
    timestamp: Date;
    context: FlowContext;
  }) {
    return {
      routeId: params.route.id,
      tripId: params.trip.id,
      patientId: params.trip.patientId,
      patientName: params.patientName ?? null,
      operationalId: params.operationalId ?? null,
      driverId: params.route.driverId,
      vehicleId: params.context.vehicleId ?? params.route.vehicleId,
      status: params.trip.status,
      routeStatus: params.route.status,
      queueStatus: params.queueStatus,
      queueId: params.queueId ?? null,
      boardedAt: params.trip.boardedAt ?? null,
      completedAt: params.trip.completedAt ?? null,
      checkpoint: params.context.checkpoint ?? null,
      gpsLat: params.context.gpsLat ?? null,
      gpsLng: params.context.gpsLng ?? null,
      deviceId: params.context.deviceId ?? null,
      source: params.context.source ?? 'api',
      timestamp: params.timestamp.toISOString(),
    };
  }

  private emitToRoute(tenantId: string, driverId: string | null, event: string, payload: Record<string, unknown>) {
    this.gateway.emitToTenant(tenantId, event, payload);
    if (driverId) {
      this.gateway.emitToDriver(driverId, event, payload);
    }
  }
}
