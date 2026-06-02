import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutesService } from '../routes/routes.service';
import { TripsService } from '../trips/trips.service';
import { TripStopsService } from '../trip-stops/trip-stops.service';
import { TrackingService } from '../tracking/tracking.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';
import { stableHash } from '../../common/qr-payload';

type OfflineSyncEvent = {
  eventId: string;
  operationId?: string;
  deviceId: string;
  type: string;
  payload?: Record<string, any>;
  routeId?: string;
  tripId?: string;
  createdAt?: string;
  retryCount?: number;
  queueOrder?: number;
};

type SyncConflict = {
  eventId: string;
  operationId?: string;
  deviceId?: string;
  tableName: string;
  entityType: string;
  entityId?: string;
  localState?: Record<string, any>;
  serverState?: Record<string, any>;
  resolution: string;
  reason: string;
  event?: Record<string, any>;
  type?: string;
};

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routes: RoutesService,
    private readonly trips: TripsService,
    private readonly tripStops: TripStopsService,
    private readonly tracking: TrackingService,
    private readonly flow: OperationalFlowService,
  ) {}

  async syncOfflineEvents(
    tenantId: string,
    body: { deviceId: string; events: OfflineSyncEvent[] },
    actor: { userId: string; driverId?: string; role: string },
  ) {
    if (!body.deviceId || !Array.isArray(body.events)) {
      throw new BadRequestException('Invalid offline sync payload');
    }

    const syncedEventIds: string[] = [];
    const conflicts: SyncConflict[] = [];
    let snapshot: Record<string, any> | null = null;

    for (let index = 0; index < body.events.length; index += 1) {
      const event = body.events[index];
      const queueOrder = event.queueOrder ?? (index + 1);
      const processedAt = new Date();
      this.logger.log(
        `[SYNC][QUEUE_REPLAY] eventId=${event.eventId} type=${event.type} tripId=${event.tripId ?? event.payload?.tripId ?? '-'} createdAt=${event.createdAt ?? event.payload?.timestamp ?? '-'} processedAt=${processedAt.toISOString()} queueOrder=${queueOrder}`,
      );
      const existing = await this.prisma.processedEvent.findUnique({
        where: { tenantId_eventId: { tenantId, eventId: event.eventId } },
      });
      if (existing) {
        this.logger.log(
          `[SYNC][QUEUE_REPLAY] skipped reason=already_processed eventId=${event.eventId} type=${event.type} queueOrder=${queueOrder}`,
        );
        syncedEventIds.push(event.eventId);
        continue;
      }

      const payload = event.payload ?? {};
      const result = await this.processEvent(tenantId, event, payload, actor);
      if (result.conflict) {
        conflicts.push(result.conflict);
        await this.prisma.conflictLog.create({
          data: {
            tenantId,
            eventId: event.eventId,
            operationId: event.operationId ?? null,
            deviceId: body.deviceId,
            entityType: result.conflict.entityType,
            entityId: result.conflict.entityId ?? null,
            localStateJson: result.conflict.localState ?? null,
            serverStateJson: result.conflict.serverState ?? null,
            resolution: result.conflict.resolution,
            reason: result.conflict.reason,
          } as any,
        });
        continue;
      }

      await this.prisma.processedEvent.create({
        data: {
          tenantId,
          eventId: event.eventId,
          operationId: event.operationId ?? null,
          deviceId: body.deviceId,
          type: event.type,
          payload: payload as any,
          status: 'PROCESSED',
          processedAt,
          syncedAt: new Date(),
          retryCount: event.retryCount ?? 0,
        } as any,
      });
      syncedEventIds.push(event.eventId);

      if (result.snapshot) {
        snapshot = result.snapshot;
      }
    }

    return { syncedEventIds, conflicts, snapshot };
  }

  private async processEvent(
    tenantId: string,
    event: OfflineSyncEvent,
    payload: Record<string, any>,
    actor: { userId: string; driverId?: string; role: string },
  ): Promise<{ conflict?: SyncConflict; snapshot?: Record<string, any> | null }> {
    const type = event.type.toUpperCase();
    const routeId = event.routeId ?? payload.routeId ?? null;
    const tripId = event.tripId ?? payload.tripId ?? null;

    try {
      switch (type) {
        case 'ROUTE_START': {
          if (!routeId) throw new BadRequestException('routeId is required');
          const route = await this.prisma.route.findFirst({ where: { id: routeId, tenantId }, select: { id: true, status: true } });
          if (!route) throw new NotFoundException('Route not found');
          if (['COMPLETED', 'CANCELLED'].includes(route.status)) {
            return this.conflict(event, 'route', route.id, payload, { status: route.status }, 'server_authoritative', 'Route already closed on server');
          }
          await this.routes.startRoute(routeId, tenantId, {
            tripId: event.tripId ?? payload.tripId,
            source: 'offline-sync',
          }, {
            driverId: actor.driverId ?? payload.driverId ?? null,
            actorUserId: actor.userId,
          });
          return { snapshot: await this.buildSnapshot(tenantId, routeId) };
        }

        case 'ROUTE_COMPLETE':
        case 'ROUTE_FORCE_COMPLETE': {
          if (!routeId) throw new BadRequestException('routeId is required');
          const route = await this.prisma.route.findFirst({ where: { id: routeId, tenantId }, select: { id: true, status: true } });
          if (!route) throw new NotFoundException('Route not found');
          if (['COMPLETED', 'CANCELLED'].includes(route.status) && type === 'ROUTE_COMPLETE') {
            return this.conflict(event, 'route', route.id, payload, { status: route.status }, 'server_authoritative', 'Route already closed on server');
          }
          if (type === 'ROUTE_FORCE_COMPLETE') {
            await this.routes.forceCompleteRoute(routeId, tenantId, {
              driverId: actor.driverId ?? payload.driverId ?? null,
              actorUserId: actor.userId,
            });
          } else {
            await this.routes.completeRoute(routeId, tenantId, {
              driverId: actor.driverId ?? payload.driverId ?? null,
              actorUserId: actor.userId,
            });
          }
          return { snapshot: await this.buildSnapshot(tenantId, routeId) };
        }

        case 'TRIP_STARTED': {
          if (!tripId) throw new BadRequestException('tripId is required');
          const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId }, select: { id: true, status: true, routeId: true } });
          if (!trip) throw new NotFoundException('Trip not found');
          if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(trip.status)) {
            return this.conflict(event, 'trip', trip.id, payload, { status: trip.status }, 'server_authoritative', 'Trip already closed on server');
          }
          await this.trips.inTransit(tripId, tenantId, {
            ...this.buildFlowContext(event, payload, actor, type),
          });
          return { snapshot: await this.buildSnapshot(tenantId, trip.routeId) };
        }

        case 'TRIP_ARRIVED': {
          if (!tripId) throw new BadRequestException('tripId is required');
          const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId }, select: { id: true, status: true, routeId: true } });
          if (!trip) throw new NotFoundException('Trip not found');
          if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(trip.status)) {
            return this.conflict(event, 'trip', trip.id, payload, { status: trip.status }, 'server_authoritative', 'Trip already closed on server');
          }
          await this.trips.arrived(tripId, tenantId, {
            ...this.buildFlowContext(event, payload, actor, type),
          });
          return { snapshot: await this.buildSnapshot(tenantId, trip.routeId) };
        }

        case 'TRIP_COMPLETED': {
          if (!tripId) throw new BadRequestException('tripId is required');
          const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId }, select: { id: true, status: true, routeId: true } });
          if (!trip) throw new NotFoundException('Trip not found');
          if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
            return this.conflict(event, 'trip', trip.id, payload, { status: trip.status }, 'server_authoritative', 'Trip already closed on server');
          }
          await this.trips.complete(tripId, tenantId, {
            ...this.buildFlowContext(event, payload, actor, type),
          });
          return { snapshot: await this.buildSnapshot(tenantId, trip.routeId) };
        }

        case 'TRIP_BOARDED': {
          if (!tripId) throw new BadRequestException('tripId is required');
          const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId }, select: { id: true, status: true, routeId: true } });
          if (!trip) throw new NotFoundException('Trip not found');
          if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(trip.status)) {
            return this.conflict(event, 'trip', trip.id, payload, { status: trip.status }, 'server_authoritative', 'Trip already closed on server');
          }
          this.logger.log(
            `[BOARDING_FLOW] TRIP_BOARDED tripId=${trip.id} routeId=${trip.routeId} oldStatus=${trip.status} newStatus=BOARDED source=${payload.source ?? 'offline-sync'}`,
          );
          await this.trips.boarded(tripId, tenantId, {
            ...this.buildFlowContext(event, payload, actor, type),
          });
          const boardedSnapshot = await this.buildSnapshot(tenantId, trip.routeId);
          this.logger.log(
            `[BOARDING_FLOW] TRIP_BOARDED completed tripId=${trip.id} routeId=${trip.routeId} operationId=${boardedSnapshot?.currentRoute?.operationId ?? 'null'}`,
          );
          return { snapshot: boardedSnapshot };
        }

        case 'TRIP_NO_SHOW': {
          if (!tripId) throw new BadRequestException('tripId is required');
          const trip = await this.prisma.trip.findFirst({ where: { id: tripId, tenantId }, select: { id: true, status: true, routeId: true } });
          if (!trip) throw new NotFoundException('Trip not found');
          if (['COMPLETED', 'CANCELLED'].includes(trip.status)) {
            return this.conflict(event, 'trip', trip.id, payload, { status: trip.status }, 'server_authoritative', 'Trip already closed on server');
          }
          const protectedStatuses = ['BOARDING', 'BOARDED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED'];
          if (protectedStatuses.includes(trip.status)) {
            this.logger.warn(
              `[SYNC][TRIP_NO_SHOW_GUARD] blocked reason=status_guard tripId=${trip.id} currentStatus=${trip.status} eventCreatedAt=${event.createdAt ?? payload.timestamp ?? '-'} eventId=${event.eventId}`,
            );
            return this.conflict(
              event,
              'trip',
              trip.id,
              payload,
              { status: trip.status },
              'server_authoritative',
              'Trip already advanced to boarding or beyond; stale no-show ignored',
            );
          }
          const eventCreatedAt = this.parseEventTimestamp(event.createdAt ?? payload.timestamp ?? null);
          const latestBoardingTransition = await this.prisma.operationalTimeline.findFirst({
            where: {
              tenantId,
              tripId: trip.id,
              toState: { in: ['BOARDING', 'BOARDED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED'] as any[] },
            },
            orderBy: { createdAt: 'desc' },
            select: { toState: true, createdAt: true, source: true },
          });
          const hasNewerBoardingTransition =
            latestBoardingTransition != null
            && (eventCreatedAt == null || latestBoardingTransition.createdAt > eventCreatedAt);
          if (hasNewerBoardingTransition && latestBoardingTransition) {
            this.logger.warn(
              `[SYNC][TRIP_NO_SHOW_GUARD] blocked reason=newer_boarding_state tripId=${trip.id} newerState=${latestBoardingTransition.toState} newerAt=${latestBoardingTransition.createdAt.toISOString()} eventCreatedAt=${eventCreatedAt?.toISOString() ?? '-'} eventId=${event.eventId}`,
            );
            return this.conflict(
              event,
              'trip',
              trip.id,
              payload,
              {
                status: trip.status,
                newerState: latestBoardingTransition.toState,
                newerStateAt: latestBoardingTransition.createdAt.toISOString(),
                newerStateSource: latestBoardingTransition.source ?? null,
              },
              'server_authoritative',
              eventCreatedAt == null
                ? 'Trip has boarding-related transition and no-show timestamp is missing; stale no-show ignored'
                : 'Trip has newer boarding-related transition; stale no-show ignored',
            );
          }
          await this.trips.noShow(tripId, tenantId, {
            ...this.buildFlowContext(event, payload, actor, type),
          });
          return { snapshot: await this.buildSnapshot(tenantId, trip.routeId) };
        }

        case 'BOARDING':
        case 'QR_SCAN': {
          const checkpoint = String(payload.checkpoint ?? 'BOARDING').toUpperCase();
          let effectiveTripId = tripId ?? payload.trip_id ?? payload.tripId ?? null;
          const validationToken = payload.validation_token ?? payload.validationToken ?? payload.qrToken ?? null;
          const patientHint =
            payload.patientId
            ?? payload.patient_id
            ?? payload.patientReference
            ?? payload.patient_reference
            ?? null;
          const routeRef = routeId ?? payload.route_id ?? payload.routeId ?? null;

          if (!effectiveTripId && validationToken) {
            const tripToken = await this.prisma.tripToken.findFirst({
              where: { tenantId, token: String(validationToken) },
              select: { tripId: true },
            });
            effectiveTripId = tripToken?.tripId ?? null;
          }

          let resolvedPatientId = patientHint;
          if (!resolvedPatientId) {
            resolvedPatientId = await this.resolvePatientFromQr(tenantId, payload, validationToken);
          }

          if (!effectiveTripId) {
            effectiveTripId = await this.resolveTodayTripByPatient(
              tenantId,
              resolvedPatientId,
              routeRef,
            );
          }
          if (!effectiveTripId) throw new BadRequestException('tripId is required');
          const trip = await this.prisma.trip.findFirst({ where: { id: effectiveTripId, tenantId }, select: { id: true, status: true, routeId: true, patientId: true } });
          if (!trip) throw new NotFoundException('Trip not found');
          if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(trip.status)) {
            return this.conflict(event, 'trip', trip.id, payload, { status: trip.status }, 'server_authoritative', 'Passenger already closed on server');
          }
          if (checkpoint === 'ARRIVAL') {
            await this.trips.arrived(effectiveTripId, tenantId, {
              ...this.buildFlowContext(event, payload, actor, type),
            });
          } else if (checkpoint === 'CHECK_IN') {
            if (['SCHEDULED', 'PENDING', 'CONFIRMED'].includes(trip.status)) {
              await this.prisma.trip.update({
                where: { id: trip.id },
                data: { status: 'CONFIRMED' as any },
              });
            }
          } else {
            await this.flow.confirmBoarding(
              tenantId,
              {
                routeId: routeRef ?? trip.routeId,
                tripId: effectiveTripId,
                patientId: resolvedPatientId ?? trip.patientId,
              },
              {
                ...this.buildFlowContext(event, payload, actor, type),
                source: type,
                checkpoint,
              },
            );
          }
          return { snapshot: await this.buildSnapshot(tenantId, trip.routeId) };
        }

        case 'TRIP_STOP_STATUS': {
          if (!payload.stopId) throw new BadRequestException('stopId is required');
          await this.tripStops.updateStatus(
            tenantId,
            payload.stopId,
            payload.status as 'EN_ROUTE' | 'ARRIVED' | 'BOARDING' | 'COMPLETED' | 'SKIPPED',
          );
          const stop = await this.prisma.tripStop.findFirst({ where: { id: payload.stopId, tenantId }, select: { tripId: true } });
          if (stop?.tripId) {
            const trip = await this.prisma.trip.findFirst({ where: { id: stop.tripId, tenantId }, select: { routeId: true } });
            return { snapshot: await this.buildSnapshot(tenantId, trip?.routeId ?? routeId) };
          }
          return { snapshot: null };
        }

        case 'TRIP_ISSUE': {
          await this.prisma.auditLog.create({
            data: {
              tenantId,
              userId: actor.userId,
              action: 'TRIP_ISSUE',
              entity: 'trip',
              entityId: tripId ?? payload.tripId ?? payload.patientId ?? 'unknown',
              deviceId: event.deviceId,
              endpoint: '/driver/mission/issue',
              method: 'POST',
              after: payload as any,
            } as any,
          });
          return { snapshot: null };
        }

        case 'GPS_UPDATE': {
          await this.tracking.heartbeat(
            {
              vehicleId: payload.vehicleId,
              driverId: payload.driverId ?? actor.driverId,
              routeId: routeId ?? payload.routeId,
              tenantId,
              lat: Number(payload.lat),
              lng: Number(payload.lng),
              speed: payload.speed != null ? Number(payload.speed) : undefined,
              heading: payload.heading != null ? Number(payload.heading) : undefined,
              accuracy: payload.accuracy != null ? Number(payload.accuracy) : undefined,
              batteryLevel: payload.batteryLevel != null ? Number(payload.batteryLevel) : undefined,
              gpsSource: payload.gpsSource,
              ignition: payload.ignition,
              deviceId: payload.deviceId ?? event.deviceId,
            },
            undefined,
          );
          return { snapshot: null };
        }

        case 'WHATSAPP_PENDING': {
          if (payload.phone && payload.message) {
            await this.prisma.notificationLog.create({
              data: {
                tenantId,
                phone: payload.phone,
                message: payload.message,
                routeId: routeId,
                tripId,
                patientId: payload.patientId ?? null,
                status: 'PENDING',
                provider: payload.provider ?? 'OFFLINE_QUEUE',
              } as any,
            });
          }
          return { snapshot: null };
        }

        default:
          this.logger.warn(`[SYNC] Ignored offline event type=${type}`);
          return { snapshot: null };
      }
    } catch (error: any) {
      return this.conflict(
        event,
        type.startsWith('TRIP') ? 'trip' : 'route',
        tripId ?? routeId ?? null,
        payload,
        { error: error?.message ?? String(error) },
        'failed',
        error?.message ?? 'Unexpected sync error',
      );
    }
  }

  private async resolvePatientFromQr(
    tenantId: string,
    payload: Record<string, any>,
    validationToken?: string | null,
  ): Promise<string | null> {
    const patientId =
      payload.patientId
      ?? payload.patient_id
      ?? payload.patientReference
      ?? payload.patient_reference
      ?? null;
    const praemId = payload.praemId ?? payload.praem_id ?? null;
    const operationalId = payload.operationalId ?? payload.operational_id ?? null;

    const token = validationToken ? String(validationToken).trim() : null;
    const tokenHash = token ? stableHash(token) : null;
    const criteria = [
      ...(patientId ? [{ id: String(patientId) }] : []),
      ...(praemId ? [{ praemId: String(praemId) }] : []),
      ...(operationalId ? [{ operationalId: String(operationalId) }] : []),
      ...(token ? [{ qrToken: token }] : []),
      ...(tokenHash ? [{ qrTokenHash: tokenHash }] : []),
    ];
    if (criteria.length === 0) return null;

    const patient = await this.prisma.patient.findFirst({
      where: {
        tenantId,
        OR: criteria,
      },
      select: { id: true },
    });

    return patient?.id ?? null;
  }

  private async resolveTodayTripByPatient(
    tenantId: string,
    patientId?: string | null,
    routeId?: string | null,
  ): Promise<string | null> {
    if (!patientId) return null;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const todayTrip = await this.prisma.trip.findFirst({
      where: {
        tenantId,
        patientId,
        ...(routeId ? { routeId } : {}),
        status: { notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as any },
        route: {
          is: {
            date: { gte: start, lt: end },
          },
        },
      },
      select: { id: true },
      orderBy: [{ boardedAt: 'asc' }, { id: 'asc' }],
    });

    return todayTrip?.id ?? null;
  }

  private conflict(
    event: OfflineSyncEvent,
    entityType: string,
    entityId: string | null,
    localState: Record<string, any>,
    serverState: Record<string, any>,
    resolution: string,
    reason: string,
  ): { conflict: SyncConflict } {
    return {
      conflict: {
        eventId: event.eventId,
        operationId: event.operationId,
        deviceId: event.deviceId,
        tableName: 'offline_sync_queue',
        entityType,
        entityId: entityId ?? undefined,
        localState,
        serverState,
        resolution,
        reason,
        event: { ...event, payload: localState },
        type: event.type,
      },
    };
  }

  private buildFlowContext(
    event: OfflineSyncEvent,
    payload: Record<string, any>,
    actor: { userId: string; driverId?: string; role: string },
    type: string,
  ) {
    const endpointFromPayload = payload.path ?? payload.endpoint ?? null;
    return {
      driverId: actor.driverId ?? payload.driverId ?? null,
      actorUserId: actor.userId,
      sourceScreen: payload.sourceScreen ?? payload.screen ?? null,
      sourceAction: payload.sourceAction ?? payload.action ?? type,
      endpoint: endpointFromPayload ?? '/sync/offline-events',
      source: type,
    };
  }

  private parseEventTimestamp(raw?: string | null): Date | null {
    if (!raw) return null;
    const parsed = new Date(String(raw));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async buildSnapshot(tenantId: string, routeId?: string | null) {
    if (!routeId) return null;
    const route = await this.prisma.route.findFirst({
      where: { id: routeId, tenantId },
      include: {
        driver: { include: { user: { select: { name: true } } } },
        vehicle: true,
        trips: {
          include: {
            patient: { select: { id: true, name: true, lat: true, lng: true, address: true } },
            stops: { orderBy: { sequence: 'asc' } },
          },
          orderBy: { boardedAt: 'asc' },
        },
      },
    });
    if (!route) return null;
    return {
      currentRoute: route,
      currentTrip: route.trips.find((trip) => !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(trip.status)) ?? null,
      patients: route.trips,
      stops: route.trips.flatMap((trip) => trip.stops ?? []),
      driver: route.driver,
      vehicle: route.vehicle,
      timeline: [],
      operationalStatus: route.status,
      routeId: route.id,
    };
  }
}
