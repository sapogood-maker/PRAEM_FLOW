import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsGateway } from '../../gateways/operations.gateway';
import { AuditService } from '../audit/audit.service';

type FlowScope = {
  routeId?: string;
  tripId?: string;
  patientId?: string;
};

type FlowContext = {
  vehicleId?: string | null;
  driverId?: string | null;
  actorUserId?: string | null;
  deviceId?: string | null;
  checkpoint?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  source?: string | null;
};

type OperationalState =
  | 'DISPATCHED'
  | 'DRIVER_ACCEPTED'
  | 'BOARDING'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED';

const TRANSITION_GRAPH: Record<OperationalState, OperationalState[]> = {
  DISPATCHED: ['DRIVER_ACCEPTED', 'CANCELLED'],
  DRIVER_ACCEPTED: ['BOARDING', 'IN_TRANSIT', 'CANCELLED'],
  BOARDING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const TERMINAL_TRIP_STATUSES = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

type FlowTrip = {
  id: string;
  tenantId: string;
  routeId: string;
  patientId: string;
  status: string;
  boardedAt: Date | null;
  completedAt: Date | null;
  route: {
    id: string;
    tenantId: string;
    driverId: string | null;
    vehicleId: string | null;
    status: string;
  };
};

@Injectable()
export class OperationalFlowService {
  private readonly logger = new Logger(OperationalFlowService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: OperationsGateway,
    private readonly audit: AuditService,
  ) {}

  async recordDispatch(tenantId: string, routeId: string, context: FlowContext = {}) {
    return this.transitionState(
      tenantId,
      { routeId },
      'DISPATCHED',
      { ...context, source: context.source ?? 'dispatch' },
      true,
    );
  }

  async startRoute(tenantId: string, routeId: string, context: FlowContext = {}, requestedTripId?: string) {
    const startTrip = await this.resolveStartTrip(tenantId, routeId, requestedTripId);
    if (!startTrip) {
      this.logger.warn(`[OPS] transition rejected reason=no_active_trip tenantId=${tenantId} routeId=${routeId} requestedTripId=${requestedTripId ?? '-'}`);
      throw new BadRequestException('No active trip available to start this route');
    }

    const previousState = this.deriveOperationalState(startTrip.route.status, startTrip.status);
    let nextState: OperationalState;
    if (previousState === 'DISPATCHED') {
      nextState = 'DRIVER_ACCEPTED';
    } else if (previousState === 'DRIVER_ACCEPTED') {
      nextState = startTrip.status === 'BOARDING' ? 'IN_TRANSIT' : 'BOARDING';
    } else if (previousState === 'BOARDING') {
      nextState = 'IN_TRANSIT';
    } else {
      this.logger.warn(`[OPS] transition rejected reason=invalid_start_state tenantId=${tenantId} routeId=${routeId} tripId=${startTrip.id} previous=${previousState}`);
      throw new BadRequestException(`Route start is not allowed from state ${previousState}`);
    }

    this.logger.log(`[OPS] startRoute resolved tripId=${startTrip.id} previous=${previousState} next=${nextState} tenantId=${tenantId} routeId=${routeId}`);
    return this.transitionState(
      tenantId,
      { routeId, tripId: startTrip.id },
      nextState,
      context,
    );
  }

  async completeRoute(tenantId: string, routeId: string, context: FlowContext = {}) {
    return this.transitionState(tenantId, { routeId }, 'COMPLETED', context, true);
  }

  async confirmBoarding(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'BOARDING', context);
  }

  async startInTransit(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'IN_TRANSIT', context);
  }

  async markArrived(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'ARRIVED', context);
  }

  async completeTrip(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'COMPLETED', context);
  }

  async cancel(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'CANCELLED', context, true);
  }

  private async transitionState(
    tenantId: string,
    scope: FlowScope,
    targetState: OperationalState,
    context: FlowContext = {},
    allowNoop = false,
  ) {
    this.logger.log(`[OPS] transition request tenantId=${tenantId} target=${targetState} routeId=${scope.routeId ?? '-'} tripId=${scope.tripId ?? '-'} patientId=${scope.patientId ?? '-'} source=${context.source ?? 'api'}`);
    const entity = await this.loadEntity(tenantId, scope);
    const currentState = this.deriveOperationalState(entity.route.status, entity.trip?.status ?? null);
    this.logger.log(`[OPS] current state tenantId=${tenantId} current=${currentState} target=${targetState} routeId=${entity.route.id} tripId=${entity.trip?.id ?? '-'}`);
    if (!allowNoop && currentState === targetState) {
      this.logger.warn(`[OPS] transition rejected reason=self_transition tenantId=${tenantId} routeId=${entity.route.id} tripId=${entity.trip?.id ?? '-'} state=${currentState}`);
      throw new BadRequestException(`Transition ${currentState} -> ${targetState} is already applied`);
    }
    if (!allowNoop && !TRANSITION_GRAPH[currentState].includes(targetState)) {
      this.logger.warn(`[OPS] transition rejected reason=invalid_path tenantId=${tenantId} routeId=${entity.route.id} tripId=${entity.trip?.id ?? '-'} current=${currentState} target=${targetState}`);
      throw new BadRequestException(`Invalid transition: ${currentState} -> ${targetState}`);
    }

    const now = new Date();
    const queue = entity.trip ? await this.findLatestQueue(tenantId, entity.trip.patientId) : null;
    let route = entity.route;
    let trip = entity.trip ?? null;
    const queueUpdate: Record<string, unknown> = {};

    if (targetState === 'DISPATCHED') {
      route = await this.prisma.route.update({ where: { id: route.id }, data: { status: 'DISPATCHED' } });
      this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
    }
    if (targetState === 'DRIVER_ACCEPTED') {
      route = await this.prisma.route.update({ where: { id: route.id }, data: { status: 'ACTIVE' } });
      this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
    }
    if (targetState === 'BOARDING' && trip) {
      trip = await this.prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'BOARDING', qrScanned: true, boardedAt: now },
        include: { route: true },
      });
      route = await this.prisma.route.update({ where: { id: route.id }, data: { status: 'ACTIVE' } });
      this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
      this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
      queueUpdate.status = 'BOARDING';
      queueUpdate.boardedAt = now;
      queueUpdate.confirmationStatus = 'CONFIRMED';
      queueUpdate.confirmedAt = now;
    }
    if (targetState === 'IN_TRANSIT' && trip) {
      trip = await this.prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'IN_PROGRESS' },
        include: { route: true },
      });
      queueUpdate.status = 'IN_TRANSIT';
      queueUpdate.departedAt = now;
      this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
    }
    if (targetState === 'ARRIVED' && trip) {
      trip = await this.prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'ARRIVED' },
        include: { route: true },
      });
      queueUpdate.status = 'ARRIVED';
      queueUpdate.arrivedAt = now;
      this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
    }
    if (targetState === 'COMPLETED') {
      if (trip) {
        trip = await this.prisma.trip.update({
          where: { id: trip.id },
          data: { status: 'COMPLETED', completedAt: now },
          include: { route: true },
        });
        queueUpdate.status = 'COMPLETED';
        this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
      }
      const remaining = await this.prisma.trip.count({
        where: {
          tenantId,
          routeId: route.id,
          status: { notIn: TERMINAL_TRIP_STATUSES as any[] },
        },
      });
      if (remaining === 0) {
        route = await this.prisma.route.update({ where: { id: route.id }, data: { status: 'COMPLETED' } });
        this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
      }
    }
    if (targetState === 'CANCELLED') {
      if (trip) {
        trip = await this.prisma.trip.update({
          where: { id: trip.id },
          data: { status: 'CANCELLED' },
          include: { route: true },
        });
        queueUpdate.status = 'CANCELLED';
        this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
      } else {
        route = await this.prisma.route.update({ where: { id: route.id }, data: { status: 'CANCELLED' } });
        this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
      }
    }

    if (queue && Object.keys(queueUpdate).length > 0) {
      await this.prisma.operationalQueue.update({ where: { id: queue.id }, data: queueUpdate });
    }

    const routeWithRelations = await this.findRoute(tenantId, route.id);
    const patient = trip ? await this.prisma.patient.findUnique({ where: { id: trip.patientId } }) : null;
    const payload = this.buildPayload({
      trip,
      route: routeWithRelations,
      queueStatus: (queueUpdate.status as string) ?? null,
      timestamp: now,
      context,
      queueId: queue?.id,
      patientName: patient?.name,
      operationalId: patient?.operationalId,
      operationalState: targetState,
    });
    this.logger.log(`[OPS] broadcasting transition state=${targetState} routeId=${payload.routeId} tripId=${payload.tripId} tenantId=${routeWithRelations.tenantId} driverId=${routeWithRelations.driverId ?? '-'}`);

    this.emitTransitionEvents(targetState, routeWithRelations.tenantId, routeWithRelations.driverId, payload);
    await this.logTransitionAudit(tenantId, scope, currentState, targetState, payload, context);

    return { trip, route: routeWithRelations, queue };
  }

  private async loadEntity(tenantId: string, scope: FlowScope) {
    if (scope.tripId || scope.patientId) {
      const trip = await this.findTrip(tenantId, scope, [
        'SCHEDULED',
        'CONFIRMED',
        'BOARDING',
        'IN_PROGRESS',
        'ARRIVED',
        'COMPLETED',
        'CANCELLED',
      ]);
      return { route: trip.route, trip };
    }
    if (!scope.routeId) {
      throw new BadRequestException('routeId or tripId is required');
    }
    const route = await this.findRoute(tenantId, scope.routeId);
    return { route, trip: null };
  }

  private deriveOperationalState(routeStatus: string, tripStatus: string | null): OperationalState {
    if (routeStatus === 'CANCELLED' || tripStatus === 'CANCELLED') return 'CANCELLED';
    if (tripStatus === 'COMPLETED') return 'COMPLETED';
    if (tripStatus === 'ARRIVED') return 'ARRIVED';
    if (tripStatus === 'IN_PROGRESS') return 'IN_TRANSIT';
    if (tripStatus === 'BOARDING') return 'BOARDING';
    if (routeStatus === 'ACTIVE' || routeStatus === 'RETURNING') return 'DRIVER_ACCEPTED';
    return 'DISPATCHED';
  }

  private emitTransitionEvents(
    state: OperationalState,
    tenantId: string,
    driverId: string | null,
    payload: Record<string, unknown>,
  ) {
    if (state === 'DISPATCHED') this.emitToRoute(tenantId, driverId, 'route:dispatched', payload);
    if (state === 'DRIVER_ACCEPTED') this.emitToRoute(tenantId, driverId, 'route:started', payload);
    if (state === 'BOARDING') {
      this.emitToRoute(tenantId, driverId, 'trip:boarding', payload);
      this.emitToRoute(tenantId, driverId, 'patient:boarded', payload);
    }
    if (state === 'IN_TRANSIT') {
      this.emitToRoute(tenantId, driverId, 'trip:started', payload);
      this.emitToRoute(tenantId, driverId, 'trip:in_transit', payload);
    }
    if (state === 'ARRIVED') {
      this.emitToRoute(tenantId, driverId, 'trip:arrived', payload);
      this.emitToRoute(tenantId, driverId, 'patient.arrived', payload);
    }
    if (state === 'COMPLETED') {
      this.emitToRoute(tenantId, driverId, 'trip:completed', payload);
      this.emitToRoute(tenantId, driverId, 'patient.completed', payload);
      this.emitToRoute(tenantId, driverId, 'route:completed', payload);
    }
    if (state === 'CANCELLED') {
      this.emitToRoute(tenantId, driverId, 'trip:cancelled', payload);
      this.emitToRoute(tenantId, driverId, 'route:cancelled', payload);
    }
    this.emitToRoute(tenantId, driverId, 'operational:state_changed', payload);
    this.emitToRoute(tenantId, driverId, 'route.status_changed', {
      routeId: payload.routeId,
      status: payload.routeStatus,
      operationalState: payload.operationalState,
      timestamp: payload.timestamp,
    });
  }

  private async logTransitionAudit(
    tenantId: string,
    scope: FlowScope,
    fromState: OperationalState,
    toState: OperationalState,
    payload: Record<string, unknown>,
    context: FlowContext,
  ) {
    await this.audit.log({
      tenantId,
      userId: context.actorUserId ?? context.driverId ?? 'system',
      action: 'OPERATIONAL_STATE_TRANSITION',
      entity: scope.tripId ? 'trip' : 'route',
      entityId: scope.tripId ?? scope.routeId ?? 'unknown',
      after: {
        fromState,
        toState,
        source: context.source ?? 'api',
        checkpoint: context.checkpoint ?? null,
        gpsLat: context.gpsLat ?? null,
        gpsLng: context.gpsLng ?? null,
        payload,
      },
    });
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

  private async findTrip(tenantId: string, scope: FlowScope, statuses: string[]): Promise<FlowTrip> {
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
      orderBy: [{ boardedAt: 'asc' }, { id: 'asc' }],
    });

    if (!trip) throw new NotFoundException('Trip not found');
    return trip;
  }

  private async resolveStartTrip(tenantId: string, routeId: string, requestedTripId?: string): Promise<FlowTrip | null> {
    const activeStatuses = ['BOARDING', 'SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'] as any[];

    if (requestedTripId) {
      const requested = await this.prisma.trip.findFirst({
        where: { tenantId, routeId, id: requestedTripId, status: { in: activeStatuses } },
        include: { route: true },
      });
      if (requested) {
        this.logger.log(`[OPS] resolved tripId from request routeId=${routeId} tripId=${requestedTripId}`);
        return requested as unknown as FlowTrip;
      }
      this.logger.warn(`[OPS] requested tripId not active routeId=${routeId} tripId=${requestedTripId}`);
    }

    const resolved = await this.prisma.trip.findFirst({
      where: { tenantId, routeId, status: { in: activeStatuses } },
      include: { route: true },
      orderBy: [{ boardedAt: 'asc' }, { id: 'asc' }],
    });
    if (resolved) {
      this.logger.log(`[OPS] resolved tripId automatically routeId=${routeId} tripId=${resolved.id} status=${resolved.status}`);
    }
    return resolved as unknown as FlowTrip | null;
  }

  private async findLatestQueue(tenantId: string, patientId: string) {
    return this.prisma.operationalQueue.findFirst({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildPayload(params: {
    trip: { id: string; routeId: string; patientId: string; status: string; boardedAt?: Date | null; completedAt?: Date | null } | null;
    route: { id: string; tenantId: string; driverId: string | null; vehicleId: string | null; status: string };
    queueStatus: string | null;
    queueId?: string | null;
    patientName?: string | null;
    operationalId?: string | null;
    operationalState: OperationalState;
    timestamp: Date;
    context: FlowContext;
  }) {
    return {
      routeId: params.route.id,
      tripId: params.trip?.id ?? null,
      patientId: params.trip?.patientId ?? null,
      patientName: params.patientName ?? null,
      operationalId: params.operationalId ?? null,
      driverId: params.route.driverId,
      vehicleId: params.context.vehicleId ?? params.route.vehicleId,
      status: params.trip?.status ?? params.route.status,
      operationalState: params.operationalState,
      routeStatus: params.route.status,
      queueStatus: params.queueStatus,
      queueId: params.queueId ?? null,
      boardedAt: params.trip?.boardedAt ?? null,
      completedAt: params.trip?.completedAt ?? null,
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
