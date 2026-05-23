import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  | 'CREATED'
  | 'DISPATCHED'
  | 'DRIVER_ACCEPTED'
  | 'WAITING_PATIENT'
  | 'BOARDING'
  | 'BOARDED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

type RouteDerivedOperationalState =
  | 'CREATED'
  | 'DISPATCHED'
  | 'DRIVER_ACCEPTED'
  | 'WAITING_PATIENT'
  | 'BOARDING'
  | 'PASSENGERS_ONBOARD'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

// Transition graph updated to explicitly model BOARDED and allow NO_SHOW reversal
const TRANSITION_GRAPH: Record<OperationalState, OperationalState[]> = {
  CREATED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DRIVER_ACCEPTED', 'NO_SHOW', 'CANCELLED'],
  DRIVER_ACCEPTED: ['WAITING_PATIENT', 'NO_SHOW', 'CANCELLED'],
  WAITING_PATIENT: ['BOARDING', 'NO_SHOW', 'CANCELLED'],
  BOARDING: ['BOARDED', 'NO_SHOW', 'CANCELLED'],
  BOARDED: ['IN_TRANSIT', 'NO_SHOW', 'CANCELLED'],
  IN_TRANSIT: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  // NO_SHOW is now reversible (e.g., supervisor reinstate)
  NO_SHOW: ['WAITING_PATIENT', 'CANCELLED'],
  CANCELLED: [],
};

// Terminal trip statuses exclude NO_SHOW so that it can be reversed by supervisors
const TERMINAL_TRIP_STATUSES = ['COMPLETED', 'CANCELLED'];

type FlowTrip = {
  id: string;
  tenantId: string;
  routeId: string;
  patientId: string;
  status: string;
  boardedAt: Date | null;
  completedAt: Date | null;
  version: number;
  route: {
    id: string;
    tenantId: string;
    driverId: string | null;
    vehicleId: string | null;
    status: string;
    operationalVersion: number;
    operationalState?: string | null;
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
      nextState = 'WAITING_PATIENT';
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
    const entity = await this.loadEntity(tenantId, scope);
    const previousState = this.deriveOperationalState(entity.route.status, entity.trip?.status ?? null);
    this.logger.log(
      `[OPS] qr boarding evaluate tenantId=${tenantId} routeId=${entity.route.id} tripId=${entity.trip?.id ?? '-'} previous=${previousState}`,
    );

    const refreshed = await this.loadEntity(tenantId, {
      routeId: entity.route.id,
      tripId: entity.trip?.id ?? scope.tripId,
      patientId: scope.patientId,
    });
    const nextResolvedState = this.deriveOperationalState(refreshed.route.status, refreshed.trip?.status ?? null);
    this.logger.log(
      `[OPS] qr boarding resolved tenantId=${tenantId} routeId=${refreshed.route.id} tripId=${refreshed.trip?.id ?? '-'} previous=${nextResolvedState} next=BOARDING`,
    );

    if (nextResolvedState === 'BOARDING') {
      this.logger.log(
        `[OPS] qr boarding accepted idempotent tenantId=${tenantId} routeId=${refreshed.route.id} tripId=${refreshed.trip?.id ?? '-'} reason=already_boarding`,
      );
      const queue = refreshed.trip ? await this.findLatestQueue(tenantId, refreshed.trip.patientId) : null;
      return { trip: refreshed.trip, route: refreshed.route, queue };
    }

    if (nextResolvedState === 'CREATED' || nextResolvedState === 'DISPATCHED' || nextResolvedState === 'DRIVER_ACCEPTED') {
      this.logger.warn(
        `[OPS] qr boarding rejected tenantId=${tenantId} routeId=${refreshed.route.id} tripId=${refreshed.trip?.id ?? '-'} reason=driver_not_ready previous=${nextResolvedState}`,
      );
      throw new BadRequestException('Driver must accept route and set waiting status before boarding');
    }
    if (!['WAITING_PATIENT'].includes(nextResolvedState)) {
      this.logger.warn(
        `[OPS] qr boarding rejected tenantId=${tenantId} routeId=${refreshed.route.id} tripId=${refreshed.trip?.id ?? '-'} reason=invalid_qr_state previous=${nextResolvedState}`,
      );
      throw new BadRequestException(`QR boarding not allowed from state ${nextResolvedState}`);
    }

    this.logger.log(
      `[OPS] qr boarding accepted tenantId=${tenantId} routeId=${refreshed.route.id} tripId=${refreshed.trip?.id ?? '-'} previous=${nextResolvedState} next=BOARDING`,
    );
    return this.transitionState(
      tenantId,
      {
        routeId: refreshed.route.id,
        tripId: refreshed.trip?.id ?? scope.tripId,
        patientId: scope.patientId,
      },
      'BOARDING',
      context,
    );
  }

  async markBoarded(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'BOARDED', context);
  }

  async startInTransit(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    // Auto-marking no-show is now opt-in to allow partial boarding/no-show flows.
    if ((context as any).autoNoShow === true) {
      await this.autoMarkNoShowBeforeTransit(tenantId, scope, context);
    }
    return this.transitionState(tenantId, scope, 'IN_TRANSIT', context);
  }

  async markArrived(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'ARRIVED', context);
  }

  async completeTrip(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'COMPLETED', context);
  }

  async markNoShow(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'NO_SHOW', context);
  }

  async cancel(tenantId: string, scope: FlowScope, context: FlowContext = {}) {
    return this.transitionState(tenantId, scope, 'CANCELLED', context, true);
  }

  /**
   * Supervisor override: reinstate a trip previously marked as NO_SHOW.
   * This makes NO_SHOW reversible for operational recovery and auditing.
   */
  async reinstateTrip(tenantId: string, tripId: string, context: FlowContext = {}) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId }, include: { route: true } });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'NO_SHOW') {
      throw new BadRequestException('Only NO_SHOW trips can be reinstated');
    }

    const now = new Date();
    const updated = await this.updateTripWithVersion(trip.id, trip.version ?? 1, { status: 'CONFIRMED', boardedAt: null });

    // sync queue if present
    const queue = await this.findLatestQueue(tenantId, trip.patientId);
    if (queue) {
      await this.prisma.operationalQueue.update({ where: { id: queue.id }, data: { status: 'CONFIRMED', noShowAt: null, noShowReason: null } });
    }

    const payload = this.buildPayload({
      trip: updated,
      route: updated.route,
      queueStatus: 'CONFIRMED',
      patientName: (await this.prisma.patient.findUnique({ where: { id: trip.patientId } }))?.name ?? null,
      operationalId: (await this.prisma.patient.findUnique({ where: { id: trip.patientId } }))?.operationalId ?? null,
      operationalState: 'WAITING_PATIENT',
      timestamp: now,
      context,
    });

    this.emitToRoute(tenantId, context.driverId ?? updated.route.driverId ?? null, 'trip:reinstate', payload);
    this.emitToRoute(tenantId, context.driverId ?? updated.route.driverId ?? null, 'operational:state_changed', payload);

    await this.audit.log({
      tenantId,
      userId: context.actorUserId ?? context.driverId ?? 'system',
      action: 'OPERATIONAL_STATE_TRANSITION',
      entity: 'trip',
      entityId: trip.id,
      after: {
        fromState: 'NO_SHOW',
        toState: 'CONFIRMED',
        source: context.source ?? 'SUPERVISOR_REINSTATE',
      },
    });
    await this.persistTimeline({
      tenantId,
      routeId: updated.routeId,
      tripId: trip.id,
      patientId: trip.patientId,
      driverId: context.driverId ?? updated.route.driverId ?? null,
      vehicleId: context.vehicleId ?? updated.route.vehicleId ?? null,
      eventType: 'SUPERVISOR_OVERRIDE',
      fromState: 'NO_SHOW',
      toState: 'CONFIRMED',
      source: context.source ?? 'SUPERVISOR_REINSTATE',
      metadata: { reason: 'MANUAL_REINSTATE' },
    });

    return { trip: updated };
  }

  /**
   * Recover stale/overnight trips: mark unboarded trips older than cutoffHours as NO_SHOW.
   * Keeps audit trail and allows later supervisor reinstatement if needed.
   */
  async recoverStaleTrips(tenantId: string, cutoffHours = 12, context: FlowContext = {}) {
    const cutoff = new Date(Date.now() - cutoffHours * 3600 * 1000);
    this.logger.log(`[RECOVERY] [OPS] scanning stale trips tenantId=${tenantId} cutoff=${cutoff.toISOString()}`);
    const staleTrips = await this.prisma.trip.findMany({
      where: {
        tenantId,
        boardedAt: null,
        status: { in: ['SCHEDULED', 'CONFIRMED', 'BOARDING'] as any[] },
        route: { date: { lt: cutoff as any } },
      },
      include: { route: true, patient: true },
    });
    const processed: string[] = [];
    for (const t of staleTrips) {
      await this.transitionState(tenantId, { tripId: t.id }, 'NO_SHOW', { ...context, source: 'RECOVERY_STALE_TRIPS' });
      processed.push(t.id);
    }
    this.logger.log(`[RECOVERY] [OPS] marked ${processed.length} stale trips as NO_SHOW`);
    return { processed };
  }

  async recoverStaleRoutes(tenantId: string, cutoffHours = 12, context: FlowContext = {}) {
    const cutoff = new Date(Date.now() - cutoffHours * 3600 * 1000);
    this.logger.log(`[RECOVERY] [OPS] scanning stale routes tenantId=${tenantId} cutoff=${cutoff.toISOString()}`);
    const staleRoutes = await this.prisma.route.findMany({
      where: {
        tenantId,
        status: { in: ['DISPATCHED', 'ACTIVE', 'RETURNING'] as any[] },
        date: { lt: cutoff },
      },
      include: {
        trips: { select: { id: true, status: true, boardedAt: true } },
      },
      orderBy: { date: 'asc' },
    });

    const diagnostics: Array<{ routeId: string; action: string; activeTrips: number; boardedTrips: number }> = [];
    for (const route of staleRoutes) {
      const activeTrips = route.trips.filter((t) => !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(String(t.status)));
      const boardedTrips = activeTrips.filter((t) => !!t.boardedAt || ['BOARDED', 'IN_TRANSIT', 'IN_PROGRESS', 'ARRIVED'].includes(String(t.status)));
      if (activeTrips.length === 0) {
        await this.updateRouteWithVersion(route.id, route.operationalVersion ?? 1, {
          status: 'COMPLETED',
          operationalState: 'COMPLETED',
        });
        diagnostics.push({ routeId: route.id, action: 'MARK_COMPLETED_NO_ACTIVE_TRIPS', activeTrips: 0, boardedTrips: 0 });
      } else {
        await this.forceCompleteRoute(tenantId, route.id, {
          ...context,
          source: context.source ?? 'RECOVERY_STALE_ROUTES',
        });
        diagnostics.push({ routeId: route.id, action: 'FORCE_COMPLETE_ROUTE', activeTrips: activeTrips.length, boardedTrips: boardedTrips.length });
      }
    }
    this.logger.log(`[RECOVERY] [OPS] stale routes processed=${diagnostics.length}`);
    return { processed: diagnostics.length, diagnostics };
  }

  /**
   * Emergency recovery: directly finalise all pending trips and the route.
   * Boarded trips → COMPLETED; non-boarded trips → NO_SHOW.
   * Bypasses the normal state machine for overnight/stuck recovery.
   */
  async forceCompleteRoute(tenantId: string, routeId: string, context: FlowContext = {}) {
    this.logger.log(
      `[FINALIZE] forceCompleteRoute tenantId=${tenantId} routeId=${routeId} driverId=${context.driverId ?? '-'} source=${context.source ?? 'force-complete'}`,
    );

    const route = await this.findRoute(tenantId, routeId);
    const now = new Date();

    const pendingTrips = await this.prisma.trip.findMany({
      where: {
        tenantId,
        routeId,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as any[] },
      },
      include: {
        patient: { select: { id: true, name: true, operationalId: true } },
      },
    });

    this.logger.log(`[FINALIZE] pending trips count=${pendingTrips.length} routeId=${routeId}`);

    const completedTripIds: string[] = [];
    const noShowTripIds: string[] = [];

    for (const trip of pendingTrips) {
      const isBoarded = !!trip.boardedAt;
      if (isBoarded) {
        await this.updateTripWithVersion(trip.id, trip.version ?? 1, { status: 'COMPLETED', completedAt: now });
        completedTripIds.push(trip.id);
        this.logger.log(`[FINALIZE] trip forced COMPLETED tripId=${trip.id} boardedAt=${trip.boardedAt}`);

        const payload = this.buildPayload({
          trip: { ...trip, status: 'COMPLETED', completedAt: now },
          route,
          queueStatus: 'COMPLETED',
          patientName: trip.patient?.name ?? null,
          operationalId: trip.patient?.operationalId ?? null,
          operationalState: 'COMPLETED',
          timestamp: now,
          context,
        });
        this.emitToRoute(tenantId, context.driverId ?? null, 'trip:completed', payload);
        this.emitToRoute(tenantId, context.driverId ?? null, 'patient.completed', payload);
      } else {
        await this.updateTripWithVersion(trip.id, trip.version ?? 1, { status: 'NO_SHOW' });
        noShowTripIds.push(trip.id);
        this.logger.log(`[FINALIZE] trip forced NO_SHOW tripId=${trip.id}`);

        const payload = this.buildPayload({
          trip: { ...trip, status: 'NO_SHOW', completedAt: null },
          route,
          queueStatus: 'NO_SHOW',
          patientName: trip.patient?.name ?? null,
          operationalId: trip.patient?.operationalId ?? null,
          operationalState: 'NO_SHOW',
          timestamp: now,
          context,
        });
        this.emitToRoute(tenantId, context.driverId ?? null, 'trip:no_show', payload);
        this.emitToRoute(tenantId, context.driverId ?? null, 'patient:no_show', payload);
      }

      // Sync queue record for this patient
      const queue = await this.findLatestQueue(tenantId, trip.patientId);
      if (queue) {
        await this.prisma.operationalQueue.update({
          where: { id: queue.id },
          data: {
            status: (isBoarded ? 'COMPLETED' : 'NO_SHOW') as any,
            ...(isBoarded ? { completedAt: now } : { noShowAt: now, noShowReason: 'UNKNOWN' as any }),
          },
        });
      }

      await this.audit.log({
        tenantId,
        userId: context.actorUserId ?? context.driverId ?? 'system',
        action: 'OPERATIONAL_STATE_TRANSITION',
        entity: 'trip',
        entityId: trip.id,
        after: {
          fromState: trip.status,
          toState: isBoarded ? 'COMPLETED' : 'NO_SHOW',
          source: context.source ?? 'FORCE_COMPLETE',
          forceComplete: true,
        },
      });
      await this.persistTimeline({
        tenantId,
        routeId,
        tripId: trip.id,
        patientId: trip.patientId,
        driverId: context.driverId ?? route.driverId ?? null,
        vehicleId: context.vehicleId ?? route.vehicleId ?? null,
        eventType: 'RECOVERY_ACTION',
        fromState: trip.status,
        toState: isBoarded ? 'COMPLETED' : 'NO_SHOW',
        source: context.source ?? 'FORCE_COMPLETE',
        metadata: { forceComplete: true },
      });
    }

    // Force-complete the route regardless of current status
    await this.updateRouteWithVersion(routeId, route.operationalVersion ?? 1, {
      status: 'COMPLETED',
      operationalState: 'COMPLETED',
    });

    const routeWithRelations = await this.findRoute(tenantId, routeId);

    const routePayload = {
      routeId,
      routeStatus: 'COMPLETED',
      operationalState: 'COMPLETED',
      driverId: context.driverId ?? route.driverId,
      vehicleId: route.vehicleId,
      completedTripIds,
      noShowTripIds,
      timestamp: now.toISOString(),
      source: context.source ?? 'FORCE_COMPLETE',
    };

    this.emitToRoute(tenantId, context.driverId ?? null, 'route:completed', routePayload);
    this.emitToRoute(tenantId, context.driverId ?? null, 'operational:state_changed', routePayload);
    this.emitToRoute(tenantId, context.driverId ?? null, 'route.status_changed', {
      routeId,
      status: 'COMPLETED',
      operationalState: 'COMPLETED',
      timestamp: now.toISOString(),
    });

    await this.audit.log({
      tenantId,
      userId: context.actorUserId ?? context.driverId ?? 'system',
      action: 'OPERATIONAL_STATE_TRANSITION',
      entity: 'route',
      entityId: routeId,
      after: {
        fromState: route.status,
        toState: 'COMPLETED',
        source: context.source ?? 'FORCE_COMPLETE',
        completedTripIds,
        noShowTripIds,
      },
    });
    await this.persistTimeline({
      tenantId,
      routeId,
      driverId: context.driverId ?? route.driverId ?? null,
      vehicleId: context.vehicleId ?? route.vehicleId ?? null,
      eventType: 'RECOVERY_ROUTE_FINALIZED',
      fromState: route.status,
      toState: 'COMPLETED',
      source: context.source ?? 'FORCE_COMPLETE',
      metadata: { completedTripIds, noShowTripIds },
    });

    this.logger.log(
      `[FINALIZE] forceCompleteRoute done routeId=${routeId} completed=${completedTripIds.length} noShow=${noShowTripIds.length}`,
    );
    return { route: routeWithRelations, completedTripIds, noShowTripIds };
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
    const driverOnlyStates: OperationalState[] = [
      'DRIVER_ACCEPTED',
      'WAITING_PATIENT',
      'BOARDING',
      'BOARDED',
      'IN_TRANSIT',
      'ARRIVED',
      'COMPLETED',
      'NO_SHOW',
    ];
    if (driverOnlyStates.includes(targetState)) {
      const supervisorOverride =
        !context.driverId &&
        !!context.actorUserId &&
        (
          (context.source ?? '').startsWith('RECOVERY_')
          || (context.source ?? '').startsWith('SUPERVISOR_')
          || (context.source ?? '').startsWith('TRIP_RECOVERY_')
        );
      if (!context.driverId && !supervisorOverride) {
        this.logger.warn(`[OPS] transition rejected reason=driver_required tenantId=${tenantId} routeId=${entity.route.id} target=${targetState}`);
        throw new BadRequestException('Only driver actions can perform this transition');
      }
      if (entity.route.driverId && entity.route.driverId !== context.driverId) {
        this.logger.warn(
          `[OPS] transition rejected reason=driver_mismatch tenantId=${tenantId} routeId=${entity.route.id} routeDriverId=${entity.route.driverId} contextDriverId=${context.driverId} target=${targetState}`,
        );
        throw new BadRequestException('Driver is not assigned to this route');
      }
    }
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
    let routeVersion = route.operationalVersion ?? 1;
    let tripVersion = trip?.version ?? 1;
    const queueUpdate: Record<string, unknown> = {};

    if (targetState === 'DISPATCHED') {
      route = await this.updateRouteWithVersion(route.id, routeVersion, { status: 'DISPATCHED', operationalState: 'DISPATCHED' });
      routeVersion = route.operationalVersion ?? routeVersion + 1;
      this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
    }
    if (targetState === 'DRIVER_ACCEPTED') {
      route = await this.updateRouteWithVersion(route.id, routeVersion, { status: 'ACTIVE', operationalState: 'DRIVER_ACCEPTED' });
      routeVersion = route.operationalVersion ?? routeVersion + 1;
      this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
    }
    if (targetState === 'WAITING_PATIENT') {
      route = await this.updateRouteWithVersion(route.id, routeVersion, { status: 'ACTIVE', operationalState: 'WAITING_PATIENT' });
      routeVersion = route.operationalVersion ?? routeVersion + 1;
      queueUpdate.status = 'WAITING';
      this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
    }
    if (targetState === 'BOARDING' && trip) {
      // Mark passenger as in the process of boarding. Actual boardedAt is set when BOARDED state is applied.
      trip = await this.updateTripWithVersion(trip.id, tripVersion, { status: 'BOARDING', qrScanned: false });
      tripVersion = trip?.version ?? (tripVersion + 1);
      route = await this.updateRouteWithVersion(route.id, routeVersion, { status: 'ACTIVE', operationalState: 'BOARDING' });
      routeVersion = route.operationalVersion ?? routeVersion + 1;
      this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
      this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
      queueUpdate.status = 'BOARDING';
      queueUpdate.confirmationStatus = 'CONFIRMED';
      queueUpdate.confirmedAt = now;
    }
    if (targetState === 'BOARDED' && trip) {
      // Passenger confirmed aboard the vehicle
      trip = await this.updateTripWithVersion(trip.id, tripVersion, { status: 'BOARDED', qrScanned: true, boardedAt: now });
      tripVersion = trip?.version ?? (tripVersion + 1);
      route = await this.updateRouteWithVersion(route.id, routeVersion, { status: 'ACTIVE', operationalState: 'PASSENGERS_ONBOARD' });
      routeVersion = route.operationalVersion ?? routeVersion + 1;
      this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
      this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
      queueUpdate.status = 'BOARDING';
      queueUpdate.boardedAt = now;
      queueUpdate.confirmationStatus = 'CONFIRMED';
      queueUpdate.confirmedAt = now;
    }

    if (targetState === 'IN_TRANSIT' && trip) {
      // Allow transition to IN_TRANSIT from BOARDED (or legacy IN_PROGRESS)
      if (!trip.boardedAt) {
        this.logger.warn(`[OPS] transition rejected reason=not_boarded tenantId=${tenantId} routeId=${route.id} tripId=${trip.id}`);
        throw new BadRequestException('Only boarded passengers can enter in-transit');
      }
      trip = await this.updateTripWithVersion(trip.id, tripVersion, { status: 'IN_TRANSIT' });
      tripVersion = trip?.version ?? (tripVersion + 1);
      route = await this.updateRouteWithVersion(route.id, routeVersion, { operationalState: 'IN_TRANSIT' });
      routeVersion = route.operationalVersion ?? routeVersion + 1;
      queueUpdate.status = 'IN_TRANSIT';
      queueUpdate.departedAt = now;
      this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
    }
    if (targetState === 'ARRIVED' && trip) {
      trip = await this.updateTripWithVersion(trip.id, tripVersion, { status: 'ARRIVED' });
      tripVersion = trip?.version ?? (tripVersion + 1);
      route = await this.updateRouteWithVersion(route.id, routeVersion, { operationalState: 'ARRIVED' });
      routeVersion = route.operationalVersion ?? routeVersion + 1;
      queueUpdate.status = 'ARRIVED';
      queueUpdate.arrivedAt = now;
      this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
    }
    if (targetState === 'COMPLETED') {
      if (trip) {
        trip = await this.updateTripWithVersion(trip.id, tripVersion, { status: 'COMPLETED', completedAt: now });
        tripVersion = trip?.version ?? (tripVersion + 1);
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
        route = await this.updateRouteWithVersion(route.id, routeVersion, { status: 'COMPLETED', operationalState: 'COMPLETED' });
        routeVersion = route.operationalVersion ?? routeVersion + 1;
        this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
      }
    }
    if (targetState === 'NO_SHOW' && trip) {
      trip = await this.updateTripWithVersion(trip.id, tripVersion, { status: 'NO_SHOW' });
      tripVersion = trip?.version ?? (tripVersion + 1);
      queueUpdate.status = 'NO_SHOW';
      queueUpdate.noShowAt = now;
      queueUpdate.noShowReason = 'NOT_FOUND';
      this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
      const remaining = await this.prisma.trip.count({
        where: {
          tenantId,
          routeId: route.id,
          status: { notIn: TERMINAL_TRIP_STATUSES as any[] },
        },
      });
      if (remaining === 0) {
        route = await this.updateRouteWithVersion(route.id, routeVersion, { status: 'COMPLETED', operationalState: 'COMPLETED' });
        routeVersion = route.operationalVersion ?? routeVersion + 1;
        this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
      }
    }
    if (targetState === 'CANCELLED') {
      if (trip) {
        trip = await this.updateTripWithVersion(trip.id, tripVersion, { status: 'CANCELLED' });
        tripVersion = trip?.version ?? (tripVersion + 1);
        queueUpdate.status = 'CANCELLED';
        this.logger.log(`[TRIP] updated tripId=${trip?.id ?? '-'} status=${trip?.status ?? '-'}`);
      } else {
        route = await this.updateRouteWithVersion(route.id, routeVersion, { status: 'CANCELLED', operationalState: 'CANCELLED' });
        routeVersion = route.operationalVersion ?? routeVersion + 1;
        this.logger.log(`[ROUTE] updated routeId=${route.id} status=${route.status}`);
      }
    }

    if (queue && Object.keys(queueUpdate).length > 0) {
      await this.prisma.operationalQueue.update({ where: { id: queue.id }, data: queueUpdate });
    }

    const routeOperationalState = await this.deriveRouteOperationalState(tenantId, route.id);
    if ((route.operationalState ?? null) !== routeOperationalState) {
      route = await this.updateRouteWithVersion(route.id, routeVersion, { operationalState: routeOperationalState });
      routeVersion = route.operationalVersion ?? routeVersion + 1;
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
      routeOperationalState,
    });
    this.logger.log(`[OPS] broadcasting transition state=${targetState} routeState=${routeOperationalState} routeId=${payload.routeId} tripId=${payload.tripId} tenantId=${routeWithRelations.tenantId} driverId=${routeWithRelations.driverId ?? '-'}`);

    this.emitTransitionEvents(targetState, routeWithRelations.tenantId, routeWithRelations.driverId, payload);
    await this.logTransitionAudit(tenantId, scope, currentState, targetState, payload, context);
    await this.persistTimeline({
      tenantId,
      routeId: route.id,
      tripId: trip?.id ?? scope.tripId ?? null,
      patientId: trip?.patientId ?? null,
      driverId: context.driverId ?? route.driverId ?? null,
      vehicleId: context.vehicleId ?? route.vehicleId ?? null,
      eventType: 'STATE_TRANSITION',
      fromState: currentState,
      toState: targetState,
      source: context.source ?? 'api',
      metadata: payload,
    });

    return { trip, route: routeWithRelations, queue };
  }

  private async loadEntity(tenantId: string, scope: FlowScope) {
    if (scope.tripId || scope.patientId) {
      const trip = await this.findTrip(tenantId, scope, [
        'SCHEDULED',
        'CONFIRMED',
        'BOARDING',
        'BOARDED',
        'IN_PROGRESS',
        'IN_TRANSIT',
        'ARRIVED',
        'COMPLETED',
        'NO_SHOW',
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
    if (tripStatus === 'NO_SHOW') return 'NO_SHOW';
    if (tripStatus === 'COMPLETED') return 'COMPLETED';
    if (tripStatus === 'ARRIVED') return 'ARRIVED';
    if (tripStatus === 'IN_PROGRESS' || tripStatus === 'IN_TRANSIT') return 'IN_TRANSIT';
    if (tripStatus === 'BOARDED') return 'BOARDED';
    if (tripStatus === 'BOARDING') return 'BOARDING';
    if (routeStatus === 'SCHEDULED' || routeStatus === 'PLANNED' || routeStatus === 'PENDING' || routeStatus === 'PREPARING') {
      return 'CREATED';
    }
    if (routeStatus === 'DISPATCHED') return 'DISPATCHED';
    if (
      (routeStatus === 'ACTIVE' || routeStatus === 'RETURNING')
      && (tripStatus === 'SCHEDULED' || tripStatus === 'CONFIRMED' || tripStatus === null)
    ) {
      return 'WAITING_PATIENT';
    }
    if (routeStatus === 'ACTIVE' || routeStatus === 'RETURNING') return 'DRIVER_ACCEPTED';
    return 'DISPATCHED';
  }

  private emitTransitionEvents(
    state: OperationalState,
    tenantId: string,
    driverId: string | null,
    payload: Record<string, unknown>,
  ) {
    if (state === 'CREATED') this.emitToRoute(tenantId, driverId, 'route:created', payload);
    if (state === 'DISPATCHED') this.emitToRoute(tenantId, driverId, 'route:dispatched', payload);
    if (state === 'DRIVER_ACCEPTED') this.emitToRoute(tenantId, driverId, 'route:started', payload);
    if (state === 'WAITING_PATIENT') this.emitToRoute(tenantId, driverId, 'route:waiting_patient', payload);
    if (state === 'BOARDING') {
      this.emitToRoute(tenantId, driverId, 'trip:boarding', payload);
    }
    if (state === 'BOARDED') {
      this.emitToRoute(tenantId, driverId, 'trip:boarded', payload);
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
    if (state === 'NO_SHOW') {
      this.emitToRoute(tenantId, driverId, 'trip:no_show', payload);
      this.emitToRoute(tenantId, driverId, 'patient:no_show', payload);
    }
    if (state === 'CANCELLED') {
      this.emitToRoute(tenantId, driverId, 'trip:cancelled', payload);
      this.emitToRoute(tenantId, driverId, 'route:cancelled', payload);
    }
    this.emitToRoute(tenantId, driverId, 'operational:state_changed', payload);
    this.emitToRoute(tenantId, driverId, 'route.status_changed', {
      routeId: payload.routeId,
      status: payload.routeStatus,
      operationalState: payload.routeOperationalState ?? payload.operationalState,
      timestamp: payload.timestamp,
    });
    this.emitToRoute(tenantId, driverId, 'route:operational_state', {
      routeId: payload.routeId,
      operationalState: payload.routeOperationalState ?? payload.operationalState,
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
    const activeStatuses = ['SCHEDULED', 'CONFIRMED', 'BOARDING', 'BOARDED', 'IN_PROGRESS', 'IN_TRANSIT'] as any[];
    const allowedOperationalStartStatuses = 'SCHEDULED,CONFIRMED,DRIVER_ACCEPTED,WAITING_PATIENT,BOARDING,BOARDED,IN_TRANSIT,IN_PROGRESS';

    const routeAnyTenant = await this.prisma.route.findUnique({
      where: { id: routeId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        trips: { select: { id: true, tenantId: true, status: true, patientId: true } },
      },
    });

    if (!routeAnyTenant) {
      this.logger.error(`[OPS] route-trips diagnostics reason=route_not_found routeId=${routeId} tenantId=${tenantId}`);
      return null;
    }

    if (routeAnyTenant.tenantId !== tenantId) {
      this.logger.error(`[OPS] route-trips diagnostics reason=tenant_mismatch routeId=${routeId} routeTenantId=${routeAnyTenant.tenantId} requestTenantId=${tenantId}`);
      return null;
    }

    const routeTrips: Array<{ id: string; tenantId: string; status: string; patientId: string }> = routeAnyTenant.trips
      .filter((t: { id: string; tenantId: string; status: string; patientId: string }) => t.tenantId === tenantId);
    const tripStatuses = routeTrips.map((t: { id: string; tenantId: string; status: string; patientId: string }) => t.status).join(',') || '-';
    this.logger.log(
      `[OPS] route-trips diagnostics routeId=${routeId} tenantId=${tenantId} routeStatus=${routeAnyTenant.status} totalTrips=${routeTrips.length} tripStatuses=${tripStatuses} activeFilter=${allowedOperationalStartStatuses}`,
    );

    if (requestedTripId) {
      const requestedTrip = routeTrips.find((t: { id: string; tenantId: string; status: string; patientId: string }) => t.id === requestedTripId) ?? null;
      if (!requestedTrip) {
        this.logger.warn(`[OPS] active trip resolution requestedTripNotLinked routeId=${routeId} tripId=${requestedTripId}`);
      } else if (!activeStatuses.includes(requestedTrip.status as any)) {
        this.logger.warn(`[OPS] active trip resolution requestedTripInvalidStatus routeId=${routeId} tripId=${requestedTrip.id} status=${requestedTrip.status}`);
      } else {
        const resolvedRequested = await this.findTrip(tenantId, { routeId, tripId: requestedTrip.id }, [
          'SCHEDULED',
          'CONFIRMED',
          'BOARDING',
          'BOARDED',
          'IN_TRANSIT',
          'IN_PROGRESS',
          'ARRIVED',
          'COMPLETED',
          'NO_SHOW',
          'CANCELLED',
        ]);
        this.logger.log(`[OPS] resolved tripId from request routeId=${routeId} tripId=${requestedTrip.id}`);
        return resolvedRequested;
      }
    }

    const autoCandidates = routeTrips.filter((t: { id: string; tenantId: string; status: string; patientId: string }) => activeStatuses.includes(t.status as any));
    // Do NOT auto-resolve a single trip as the route's active trip. Routes are multi-passenger
    // and should not be tightly coupled to a single Trip. Require explicit trip selection or
    // rely on active candidate selection below.

    if (autoCandidates.length === 0) {
      this.logger.error(`[OPS] active trip resolution failed reason=no_candidate routeId=${routeId} tenantId=${tenantId} totalTrips=${routeTrips.length} candidateTrips=${autoCandidates.length}`);
      return null;
    }

    autoCandidates.sort(
      (a: { id: string; tenantId: string; status: string; patientId: string }, b: { id: string; tenantId: string; status: string; patientId: string }) => a.id.localeCompare(b.id),
    );
    const chosen = autoCandidates[0];
    const resolved = await this.findTrip(tenantId, { routeId, tripId: chosen.id }, [
      'SCHEDULED',
      'CONFIRMED',
      'BOARDING',
      'BOARDED',
      'IN_TRANSIT',
      'IN_PROGRESS',
      'ARRIVED',
      'COMPLETED',
      'NO_SHOW',
      'CANCELLED',
    ]);
    this.logger.log(`[OPS] resolved tripId automatically routeId=${routeId} tripId=${resolved.id} status=${resolved.status}`);
    return resolved;
  }

  private async autoMarkNoShowBeforeTransit(tenantId: string, scope: FlowScope, context: FlowContext) {
    // Auto no-show marking is opt-in via context.autoNoShow to support partial boarding/no-show flows.
    if (!(context as any).autoNoShow) {
      this.logger.log(`[OPS] auto no-show disabled for tenant=${tenantId} scope=${JSON.stringify(scope)}`);
      return;
    }
    const entity = await this.loadEntity(tenantId, scope);
    if (!entity.trip) return;
    const pendingTrips = await this.prisma.trip.findMany({
      where: {
        tenantId,
        routeId: entity.route.id,
        id: { not: entity.trip.id },
        boardedAt: null,
        status: { in: ['SCHEDULED', 'CONFIRMED'] as any[] },
      },
      select: { id: true },
    });
    for (const pending of pendingTrips) {
      await this.transitionState(
        tenantId,
        { tripId: pending.id },
        'NO_SHOW',
        { ...context, source: context.source ?? 'AUTO_NO_SHOW_BEFORE_TRANSIT' },
      );
    }
  }

  private async findLatestQueue(tenantId: string, patientId: string) {
    return this.prisma.operationalQueue.findFirst({
      where: { tenantId, patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async deriveRouteOperationalState(tenantId: string, routeId: string): Promise<RouteDerivedOperationalState> {
    const trips = await this.prisma.trip.findMany({
      where: { tenantId, routeId },
      select: { status: true, boardedAt: true },
    });
    if (trips.length === 0) return 'CREATED';
    const statuses = trips.map((t) => String(t.status));
    const hasTransit = statuses.some((s) => s === 'IN_TRANSIT' || s === 'IN_PROGRESS');
    const hasBoarded = statuses.some((s) => s === 'BOARDED' || s === 'BOARDING' || s === 'ARRIVED' || s === 'COMPLETED') || trips.some((t) => !!t.boardedAt);
    const hasPending = statuses.some((s) => ['SCHEDULED', 'CONFIRMED', 'BOARDING'].includes(s));
    const allCompleted = statuses.every((s) => s === 'COMPLETED' || s === 'CANCELLED' || s === 'NO_SHOW');
    const allNoShowOrCancelled = statuses.every((s) => s === 'NO_SHOW' || s === 'CANCELLED');

    if (allCompleted) return 'COMPLETED';
    if (allNoShowOrCancelled) return 'NO_SHOW';
    if (hasTransit) return 'IN_TRANSIT';
    if (hasBoarded && hasPending) return 'PASSENGERS_ONBOARD';
    if (hasBoarded) return 'PASSENGERS_ONBOARD';
    if (hasPending) return 'WAITING_PATIENT';
    return 'DRIVER_ACCEPTED';
  }

  private async updateRouteWithVersion(routeId: string, expectedVersion: number, data: Record<string, unknown>) {
    const result = await this.prisma.route.updateMany({
      where: { id: routeId, operationalVersion: expectedVersion },
      data: { ...data, operationalVersion: { increment: 1 } as any },
    });
    if (result.count === 0) {
      this.logger.warn(`[CONFLICT] route stale update rejected routeId=${routeId} expectedVersion=${expectedVersion}`);
      throw new ConflictException('Route was updated by another operator. Refresh and retry.');
    }
    const updated = await this.prisma.route.findUnique({ where: { id: routeId } });
    if (!updated) throw new NotFoundException('Route not found');
    return updated;
  }

  private async updateTripWithVersion(tripId: string, expectedVersion: number, data: Record<string, unknown>) {
    const result = await this.prisma.trip.updateMany({
      where: { id: tripId, version: expectedVersion },
      data: { ...data, version: { increment: 1 } as any },
    });
    if (result.count === 0) {
      this.logger.warn(`[CONFLICT] trip stale update rejected tripId=${tripId} expectedVersion=${expectedVersion}`);
      throw new ConflictException('Trip was updated by another operator. Refresh and retry.');
    }
    const updated = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { route: true } });
    if (!updated) throw new NotFoundException('Trip not found');
    return updated as any;
  }

  private async persistTimeline(params: {
    tenantId: string;
    routeId?: string | null;
    tripId?: string | null;
    patientId?: string | null;
    driverId?: string | null;
    vehicleId?: string | null;
    eventType: string;
    fromState?: string | null;
    toState?: string | null;
    source?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    this.logger.log(`[TIMELINE] persist event=${params.eventType} routeId=${params.routeId ?? '-'} tripId=${params.tripId ?? '-'} to=${params.toState ?? '-'}`);
    await this.prisma.operationalTimeline.create({
      data: {
        tenantId: params.tenantId,
        routeId: params.routeId ?? null,
        tripId: params.tripId ?? null,
        patientId: params.patientId ?? null,
        driverId: params.driverId ?? null,
        vehicleId: params.vehicleId ?? null,
        eventType: params.eventType,
        fromState: params.fromState ?? null,
        toState: params.toState ?? null,
        source: params.source ?? null,
        metadata: (params.metadata ?? {}) as any,
      },
    });
  }

  private buildPayload(params: {
    trip: { id: string; routeId: string; patientId: string; status: string; boardedAt?: Date | null; completedAt?: Date | null } | null;
    route: { id: string; tenantId: string; driverId: string | null; vehicleId: string | null; status: string };
    routeOperationalState?: RouteDerivedOperationalState | null;
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
      routeOperationalState: params.routeOperationalState ?? null,
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
