import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsGateway } from '../../gateways/operations.gateway';
import { sanitizePayload } from '../../common/sanitize';
import { AuditService } from '../audit/audit.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';
import {
  distanceMeters,
  loadTrackingPolicy,
  shouldPersistTrackingPoint,
  shouldThrottleGps,
} from './tracking-policy';

export type VehicleTrackingPayload = {
  vehicleId: string;
  driverId?: string;
  routeId?: string;
  tenantId: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  batteryLevel?: number;
  signalStrength?: number;
  gpsSource?: string;
  ignition?: boolean;
  deviceId?: string;
};

// Seconds without heartbeat before a vehicle is considered OFFLINE
const OFFLINE_THRESHOLD_SECONDS = 60;

function deriveOperationalStatus(speed?: number | null, online?: boolean): string {
  if (!online) return 'OFFLINE';
  if (!speed || speed < 2) return 'IDLE';
  return 'MOVING';
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly trackingPolicy = loadTrackingPolicy();
  private readonly lastIngestByKey = new Map<string, number>();
  private readonly lastPersistedPointByKey = new Map<string, { lat: number; lng: number; heading: number | null; timestamp: Date }>();
  private readonly lastGeoEvalByKey = new Map<string, number>();
  private readonly lastGeoAlertByKey = new Map<string, number>();
  private readonly lastMovingByKey = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsGateway: OperationsGateway,
    private readonly audit: AuditService,
    private readonly flow: OperationalFlowService,
  ) {}

  /**
   * Persist a heartbeat from a vehicle device.
   * Validates device auth token when deviceId is provided.
   */
  async heartbeat(raw: VehicleTrackingPayload, deviceAuthToken?: string) {
    const payload = sanitizePayload(raw) as VehicleTrackingPayload;

    // Device auth validation
    if (deviceAuthToken) {
      const device = await this.prisma.device.findUnique({ where: { authToken: deviceAuthToken } });
      if (!device || !device.active) throw new UnauthorizedException('Device token inválido ou inativo');
      if (device.tenantId !== payload.tenantId) throw new UnauthorizedException('Device não pertence a este tenant');
    }

    const now = new Date();
    const operationalStatus = deriveOperationalStatus(payload.speed, true) as any;
    const isMoving = (payload.speed ?? 0) >= 2;
    const key = this.gpsCacheKey(payload.tenantId, payload.vehicleId, payload.routeId ?? null);
    const nowMs = now.getTime();
    const throttled = shouldThrottleGps(this.lastIngestByKey.get(key), nowMs, this.trackingPolicy.floodMinIntervalMs);
    if (throttled) {
      this.logger.warn(
        `[TRACKING] [GPS] [FLOOD_PROTECTION] heartbeat throttled tenantId=${payload.tenantId} vehicleId=${payload.vehicleId} routeId=${payload.routeId ?? '-'} minIntervalMs=${this.trackingPolicy.floodMinIntervalMs}`,
      );
    }

    let record: { id: string } | null = null;
    if (!throttled) {
      record = await this.prisma.vehicleTracking.create({
        data: {
          tenantId: payload.tenantId,
          vehicleId: payload.vehicleId,
          routeId: payload.routeId ?? null,
          driverId: payload.driverId ?? null,
          lat: payload.lat,
          lng: payload.lng,
          speed: payload.speed ?? null,
          heading: payload.heading ?? null,
          accuracy: payload.accuracy ?? null,
          batteryLevel: payload.batteryLevel ?? null,
          signalStrength: payload.signalStrength ?? null,
          gpsSource: payload.gpsSource ?? null,
          ignition: payload.ignition ?? false,
          online: true,
          operationalStatus,
          lastHeartbeatAt: now,
          ...(isMoving && { lastMovementAt: now }),
          timestamp: now,
        },
        select: { id: true },
      });
      this.lastIngestByKey.set(key, nowMs);

      const lastPersisted = await this.getLatestPersistReference(payload.tenantId, payload.vehicleId, payload.routeId ?? null);
      const persistDecision = shouldPersistTrackingPoint(
        lastPersisted,
        {
          lat: payload.lat,
          lng: payload.lng,
          heading: payload.heading ?? null,
          timestamp: now,
        },
        this.trackingPolicy,
      );

      if (persistDecision.persist) {
        await this.prisma.trackingPoint.create({
          data: {
            tenantId: payload.tenantId,
            routeId: payload.routeId ?? null,
            driverId: payload.driverId ?? null,
            vehicleId: payload.vehicleId,
            lat: payload.lat,
            lng: payload.lng,
            speed: payload.speed ?? null,
            heading: payload.heading ?? null,
            timestamp: now,
          },
        });
        await this.prisma.operationalTimeline.create({
          data: {
            tenantId: payload.tenantId,
            routeId: payload.routeId ?? null,
            driverId: payload.driverId ?? null,
            vehicleId: payload.vehicleId,
            eventType: 'GPS_CHECKPOINT',
            source: 'TRACKING_HEARTBEAT',
            metadata: {
              lat: payload.lat,
              lng: payload.lng,
              speed: payload.speed ?? null,
              heading: payload.heading ?? null,
              timestamp: now.toISOString(),
              persistedBy: persistDecision.reason,
            } as any,
          },
        });
        this.lastPersistedPointByKey.set(key, {
          lat: payload.lat,
          lng: payload.lng,
          heading: payload.heading ?? null,
          timestamp: now,
        });
        this.logger.log(
          `[TRACKING] [GPS] persisted checkpoint tenantId=${payload.tenantId} vehicleId=${payload.vehicleId} routeId=${payload.routeId ?? '-'} reason=${persistDecision.reason} dist=${persistDecision.distanceMeters.toFixed(1)}m dt=${persistDecision.elapsedSeconds.toFixed(1)}s`,
        );
      } else {
        this.logger.debug(
          `[TRACKING] [GPS] skipped checkpoint tenantId=${payload.tenantId} vehicleId=${payload.vehicleId} routeId=${payload.routeId ?? '-'} dist=${persistDecision.distanceMeters.toFixed(1)}m dt=${persistDecision.elapsedSeconds.toFixed(1)}s hdg=${persistDecision.headingDelta.toFixed(1)}`,
        );
      }
    }

    // Emit real-time location update
    this.logger.log(`[TRACKING] [OPS] heartbeat tenantId=${payload.tenantId} vehicleId=${payload.vehicleId} driverId=${payload.driverId ?? '-'} routeId=${payload.routeId ?? '-'}`);
    this.opsGateway.emitToTenant(payload.tenantId, 'vehicle.location_updated', {
      vehicleId: payload.vehicleId,
      driverId: payload.driverId ?? null,
      routeId: payload.routeId ?? null,
      tenantId: payload.tenantId,
      lat: payload.lat,
      lng: payload.lng,
      speed: payload.speed,
      heading: payload.heading,
      accuracy: payload.accuracy,
      operationalStatus,
      batteryLevel: payload.batteryLevel,
      timestamp: now.toISOString(),
    });
    this.opsGateway.emitToTenant(payload.tenantId, 'driver:location:update', {
      vehicleId: payload.vehicleId,
      driverId: payload.driverId ?? null,
      routeId: payload.routeId ?? null,
      tenantId: payload.tenantId,
      lat: payload.lat,
      lng: payload.lng,
      speed: payload.speed,
      heading: payload.heading,
      accuracy: payload.accuracy,
      operationalStatus,
      batteryLevel: payload.batteryLevel,
      timestamp: now.toISOString(),
    });
    this.logger.log(`[TRACKING] [OPS] broadcast tenantId=${payload.tenantId} vehicleId=${payload.vehicleId} routeId=${payload.routeId ?? '-'}`);
    if (record?.id) {
      await this.audit.log({
        tenantId: payload.tenantId,
        userId: payload.driverId ?? payload.vehicleId,
        action: 'GPS_POSITION',
        entity: 'vehicle_tracking',
        entityId: record.id,
        after: {
          vehicleId: payload.vehicleId,
          driverId: payload.driverId ?? null,
          routeId: payload.routeId ?? null,
          lat: payload.lat,
          lng: payload.lng,
          speed: payload.speed ?? null,
          heading: payload.heading ?? null,
          batteryLevel: payload.batteryLevel ?? null,
          timestamp: now.toISOString(),
        },
      });
    }
    // Battery alert
    if (payload.batteryLevel !== undefined && payload.batteryLevel < 20) {
      this.opsGateway.emitAlert(payload.tenantId, {
        type: 'LOW_BATTERY',
        message: `Bateria baixa no tablet — veículo ${payload.vehicleId} (${payload.batteryLevel}%)`,
        severity: 'warning',
        data: { vehicleId: payload.vehicleId, batteryLevel: payload.batteryLevel },
      });
    }

    await this.evaluateGeofenceIntelligence(payload.tenantId, {
      routeId: payload.routeId ?? null,
      vehicleId: payload.vehicleId,
      driverId: payload.driverId ?? null,
      lat: payload.lat,
      lng: payload.lng,
      speed: payload.speed ?? null,
      timestamp: now,
    });
    return { id: record?.id ?? null, operationalStatus, throttled };
  }

  /**
   * Returns the latest tracking state per vehicle for the tenant (live view).
   * Also flags any vehicle as OFFLINE if heartbeat is stale.
   */
  async getLiveVehicles(tenantId: string) {
    // Get the latest tracking record per vehicle
    const trackings = await this.prisma.vehicleTracking.findMany({
      where: { tenantId },
      orderBy: { timestamp: 'desc' },
      distinct: ['vehicleId'],
      include: {
        vehicle: { select: { id: true, plate: true, model: true, type: true, status: true, capacity: true } },
      },
    });

    const now = Date.now();
    return trackings.map((t: any) => {
      const staleSecs = t.lastHeartbeatAt
        ? (now - new Date(t.lastHeartbeatAt).getTime()) / 1000
        : Infinity;
      const isOffline = staleSecs > OFFLINE_THRESHOLD_SECONDS;
      return {
        ...t,
        operationalStatus: isOffline ? 'OFFLINE' : t.operationalStatus,
        online: !isOffline,
        staleSecs: Math.round(staleSecs),
      };
    });
  }

  /**
   * Mark stale vehicles as OFFLINE and emit WS events.
   * Called periodically or on-demand.
   */
  async detectOfflineVehicles(tenantId: string) {
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_SECONDS * 1000);
    const stale = await this.prisma.vehicleTracking.findMany({
      where: {
        tenantId,
        online: true,
        lastHeartbeatAt: { lt: threshold },
      },
      distinct: ['vehicleId'],
      orderBy: { timestamp: 'desc' },
    });

    for (const t of stale) {
      this.opsGateway.emitToTenant(tenantId, 'vehicle.offline', {
        vehicleId: t.vehicleId,
        lastSeen: t.lastHeartbeatAt?.toISOString(),
        routeId: t.routeId,
      });
      this.opsGateway.emitAlert(tenantId, {
        type: 'VEHICLE_OFFLINE',
        message: `Veículo offline — sem sinal há mais de ${OFFLINE_THRESHOLD_SECONDS}s`,
        severity: 'critical',
        data: { vehicleId: t.vehicleId, lastSeen: t.lastHeartbeatAt?.toISOString() },
      });
    }

    return { offlineDetected: stale.length };
  }

  /**
   * Register a geofence event (ARRIVED_AT_DESTINATION, LEFT_DESTINATION, etc.)
   */
  async registerGeoFenceEvent(tenantId: string, data: {
    vehicleId: string;
    eventType: string;
    lat: number;
    lng: number;
    routeId?: string;
    tripId?: string;
    locationId?: string;
    locationName?: string;
  }) {
    const event = await this.prisma.geoFenceEvent.create({
      data: { tenantId, ...data },
    });
    const wsEvent = data.eventType === 'ARRIVED_AT_DESTINATION' ? 'vehicle.arrived_at_destination' : 'vehicle.geofence_event';
    this.opsGateway.emitToTenant(tenantId, wsEvent, {
      vehicleId: data.vehicleId,
      eventType: data.eventType,
      locationName: data.locationName,
      routeId: data.routeId,
      tripId: data.tripId,
      timestamp: event.detectedAt.toISOString(),
    });
    return event;
  }

  /**
   * Operational analytics — prepared for AI future.
   */
  async analytics(tenantId: string) {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_SECONDS * 1000);

    const [totalRecords, onlineCount, offlineCount, movingCount, geofenceArrivals, trackingPoints24h] = await Promise.all([
      this.prisma.vehicleTracking.count({ where: { tenantId, timestamp: { gte: since24h } } }),
      this.prisma.vehicleTracking.count({
        where: { tenantId, online: true, lastHeartbeatAt: { gte: threshold } },
      }),
      this.prisma.vehicleTracking.count({
        where: { tenantId, lastHeartbeatAt: { lt: threshold } },
      }),
      this.prisma.vehicleTracking.count({
        where: { tenantId, operationalStatus: 'MOVING', timestamp: { gte: since24h } },
      }),
      this.prisma.geoFenceEvent.count({
        where: { tenantId, eventType: 'ARRIVED_AT_DESTINATION', detectedAt: { gte: since24h } },
      }),
      this.prisma.trackingPoint.count({
        where: { tenantId, timestamp: { gte: since24h } },
      }),
    ]);

    return {
      totalRecords24h: totalRecords,
      onlineNow: onlineCount,
      offlineNow: offlineCount,
      movingRecords24h: movingCount,
      geofenceArrivals24h: geofenceArrivals,
      trackingPoints24h,
    };
  }

  async getTrackingHistory(tenantId: string, routeId?: string, vehicleId?: string, limit = 1000) {
    const items = await this.prisma.trackingPoint.findMany({
      where: {
        tenantId,
        ...(routeId ? { routeId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: Math.min(Math.max(limit, 50), 5000),
    });
    return { items: items.reverse() };
  }

  async getOperationalTimeline(tenantId: string, routeId?: string, tripId?: string, limit = 500) {
    const items = await this.prisma.operationalTimeline.findMany({
      where: {
        tenantId,
        ...(routeId ? { routeId } : {}),
        ...(tripId ? { tripId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 50), 5000),
    });
    return { items };
  }

  async getRouteReplay(tenantId: string, routeId: string, maxPoints = 3000) {
    const route = await this.prisma.route.findFirst({
      where: { tenantId, id: routeId },
      include: {
        driver: { include: { user: { select: { name: true } } } },
        vehicle: { select: { id: true, plate: true, model: true } },
        trips: {
          include: {
            patient: { select: { id: true, name: true } },
          },
          orderBy: [{ boardedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!route) return { route: null, points: [], timeline: [], metrics: null };

    const pointsRaw = await this.prisma.trackingPoint.findMany({
      where: { tenantId, routeId },
      orderBy: { timestamp: 'asc' },
      take: 20000,
    });

    const points = this.downsampleReplayPoints(pointsRaw, Math.min(Math.max(maxPoints, 200), 10000));

    const timeline = await this.prisma.operationalTimeline.findMany({
      where: { tenantId, routeId },
      orderBy: { createdAt: 'asc' },
      take: 2000,
    });

    const metrics = this.computeReplayMetrics(route, pointsRaw);
    this.logger.log(`[TRACKING] [REPLAY] routeId=${routeId} rawPoints=${pointsRaw.length} sampled=${points.length} events=${timeline.length}`);
    return {
      route,
      points,
      trackingPoints: points,
      tracking_points: points,
      timeline,
      metrics,
    };
  }

  /**
   * Smart retention with optional archive summary.
   * Keeps latest per vehicle and applies separate stale retention for points without route.
   */
  async cleanup(
    tenantId: string,
    options?: {
      retentionHours?: number;
      staleRetentionHours?: number;
      snapshotRetentionHours?: number;
      archiveEnabled?: boolean;
    },
  ) {
    const retentionHours = options?.retentionHours ?? this.trackingPolicy.retentionHours;
    const staleRetentionHours = options?.staleRetentionHours ?? this.trackingPolicy.staleRetentionHours;
    const snapshotRetentionHours = options?.snapshotRetentionHours ?? this.trackingPolicy.snapshotRetentionHours;
    const archiveEnabled = options?.archiveEnabled ?? this.trackingPolicy.archiveEnabled;
    const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    const staleCutoff = new Date(Date.now() - staleRetentionHours * 60 * 60 * 1000);
    const snapshotCutoff = new Date(Date.now() - snapshotRetentionHours * 60 * 60 * 1000);

    if (archiveEnabled) {
      await this.archiveTrackingWindow(tenantId, cutoff);
    }

    const latest = await this.prisma.vehicleTracking.findMany({
      where: { tenantId },
      distinct: ['vehicleId'],
      orderBy: { timestamp: 'desc' },
      select: { id: true },
    });
    const keepIds = latest.map((r: any) => r.id);

    const deleted = await this.prisma.vehicleTracking.deleteMany({
      where: {
        tenantId,
        timestamp: { lt: snapshotCutoff },
        id: { notIn: keepIds },
      },
    });
    const trackingPointDeleted = await this.prisma.trackingPoint.deleteMany({
      where: {
        tenantId,
        OR: [
          { timestamp: { lt: cutoff } },
          { routeId: null, timestamp: { lt: staleCutoff } },
        ],
      },
    });

    this.logger.log(
      `[TRACKING] [GPS] cleanup tenantId=${tenantId} retentionHours=${retentionHours} staleHours=${staleRetentionHours} snapshotHours=${snapshotRetentionHours} deletedTrackings=${deleted.count} deletedPoints=${trackingPointDeleted.count}`,
    );
    return {
      deletedRows: deleted.count,
      deletedTrackingPoints: trackingPointDeleted.count,
      cutoff: cutoff.toISOString(),
      staleCutoff: staleCutoff.toISOString(),
      snapshotCutoff: snapshotCutoff.toISOString(),
      archiveEnabled,
    };
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'tracking-retention-cleanup' })
  async runScheduledCleanup() {
    const tenants = await this.prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
      take: 1000,
    });
    for (const tenant of tenants) {
      try {
        await this.cleanup(tenant.id);
      } catch (err) {
        this.logger.error(
          `[TRACKING] cleanup failed tenantId=${tenant.id} message=${(err as Error).message}`,
        );
      }
    }
  }

  // Legacy in-memory methods kept for backward-compat
  vehicles() {
    return [];
  }

  vehicleById(_vehicleId: string) {
    return null;
  }

  private gpsCacheKey(tenantId: string, vehicleId: string, routeId: string | null) {
    return `${tenantId}:${vehicleId}:${routeId ?? '-'}`;
  }

  private async getLatestPersistReference(tenantId: string, vehicleId: string, routeId: string | null) {
    const key = this.gpsCacheKey(tenantId, vehicleId, routeId);
    const cached = this.lastPersistedPointByKey.get(key);
    if (cached) return cached;
    const latest = await this.prisma.trackingPoint.findFirst({
      where: { tenantId, vehicleId, routeId },
      orderBy: { timestamp: 'desc' },
      select: { lat: true, lng: true, heading: true, timestamp: true },
    });
    if (!latest) return null;
    const mapped = {
      lat: latest.lat,
      lng: latest.lng,
      heading: latest.heading ?? null,
      timestamp: latest.timestamp,
    };
    this.lastPersistedPointByKey.set(key, mapped);
    return mapped;
  }

  private async archiveTrackingWindow(tenantId: string, cutoff: Date) {
    const grouped = await this.prisma.trackingPoint.groupBy({
      by: ['routeId', 'vehicleId'],
      where: { tenantId, timestamp: { lt: cutoff }, routeId: { not: null } },
      _count: { _all: true },
      _min: { timestamp: true },
      _max: { timestamp: true },
      _avg: { speed: true },
    });
    if (!grouped.length) return;
    await this.prisma.operationalTimeline.createMany({
      data: grouped.map((g) => ({
        tenantId,
        routeId: g.routeId,
        vehicleId: g.vehicleId,
        eventType: 'TRACKING_ARCHIVE',
        source: 'TRACKING_RETENTION_JOB',
        metadata: {
          archivedPoints: g._count._all,
          from: g._min.timestamp?.toISOString() ?? null,
          to: g._max.timestamp?.toISOString() ?? null,
          avgSpeed: g._avg.speed ?? null,
          retentionCutoff: cutoff.toISOString(),
        } as any,
      })),
    });
    this.logger.log(
      `[TRACKING] [GPS] archived tracking window tenantId=${tenantId} groups=${grouped.length} cutoff=${cutoff.toISOString()}`,
    );
  }

  private async tryAutoArrive(
    tenantId: string,
    input: { routeId: string | null; driverId: string | null; vehicleId: string; timestamp: Date },
  ) {
    if (!this.trackingPolicy.geofenceAutoArrived || !input.routeId) return;
    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        tenantId,
        routeId: input.routeId,
        status: { in: ['IN_TRANSIT'] as any[] },
      },
      orderBy: [{ boardedAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!activeTrip) return;
    try {
      await this.flow.markArrived(tenantId, { routeId: input.routeId, tripId: activeTrip.id }, {
        source: 'GEOFENCE_AUTO_ARRIVED',
        driverId: input.driverId,
      });
      this.logger.log(`[TRACKING] [GEOFENCE] auto arrived routeId=${input.routeId} tripId=${activeTrip.id} vehicleId=${input.vehicleId}`);
      if (this.trackingPolicy.geofenceAutoProgression) {
        this.opsGateway.emitToTenant(tenantId, 'route:progression_suggestion', {
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          suggestedState: 'COMPLETED',
          reason: 'AUTO_ARRIVED_COMPLETED_PENDING',
          timestamp: input.timestamp.toISOString(),
        });
      }
    } catch (err) {
      this.logger.warn(`[TRACKING] [GEOFENCE] auto-arrive skipped routeId=${input.routeId} tripId=${activeTrip.id} reason=${(err as Error).message}`);
    }
  }

  private async detectLongStopAndDeviation(
    tenantId: string,
    input: {
      routeId: string | null;
      vehicleId: string;
      driverId: string | null;
      lat: number;
      lng: number;
      speed: number | null;
      timestamp: Date;
    },
    nearest: { id: string; name: string; distance: number; type: string } | null,
    key: string,
  ) {
    const nowMs = input.timestamp.getTime();
    const cooldownMs = this.trackingPolicy.geofenceAlertCooldownSeconds * 1000;
    const lastMovingAtMs = this.lastMovingByKey.get(key) ?? nowMs;
    const speed = input.speed ?? 0;
    const isStopped = speed < 2.5;
    const longStopSeconds = Math.max(0, (nowMs - lastMovingAtMs) / 1000);

    if (isStopped && longStopSeconds >= this.trackingPolicy.geofenceLongStopSeconds) {
      const alertKey = `${key}:LONG_STOP`;
      const lastAlert = this.lastGeoAlertByKey.get(alertKey) ?? 0;
      if (nowMs - lastAlert >= cooldownMs) {
        this.lastGeoAlertByKey.set(alertKey, nowMs);
        this.logger.warn(`[TRACKING] [GEOFENCE] long stop routeId=${input.routeId ?? '-'} vehicleId=${input.vehicleId} seconds=${longStopSeconds.toFixed(0)}`);
        await this.registerGeoFenceEvent(tenantId, {
          vehicleId: input.vehicleId,
          eventType: 'LONG_STOP',
          lat: input.lat,
          lng: input.lng,
          routeId: input.routeId ?? undefined,
        });
        this.opsGateway.emitToTenant(tenantId, 'geofence:long_stop', {
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          driverId: input.driverId,
          longStopSeconds: Math.round(longStopSeconds),
          timestamp: input.timestamp.toISOString(),
        });
        if (this.trackingPolicy.geofenceAlertsEnabled) {
          this.opsGateway.emitAlert(tenantId, {
            type: 'LONG_STOP',
            message: `Parada longa detectada (${Math.round(longStopSeconds / 60)} min).`,
            severity: 'warning',
            data: { routeId: input.routeId, vehicleId: input.vehicleId, longStopSeconds: Math.round(longStopSeconds) },
          });
        }
      }
    }

    if (!input.routeId) return;

    const route = await this.prisma.route.findFirst({
      where: { id: input.routeId, tenantId },
      include: {
        trips: {
          where: { status: { in: ['BOARDING', 'BOARDED', 'IN_TRANSIT', 'ARRIVED'] as any[] } },
          include: {
            stops: {
              where: { status: { in: ['PENDING', 'EN_ROUTE', 'ARRIVED', 'BOARDING'] as any[] } },
              orderBy: { sequence: 'asc' },
              take: 1,
            },
          },
          orderBy: [{ boardedAt: 'asc' }, { id: 'asc' }],
          take: 1,
        },
      },
    });
    const targetTrip = route?.trips?.[0];
    const targetStop = targetTrip?.stops?.[0];
    if (targetStop?.lat == null || targetStop.lng == null) return;
    const distanceToStop = distanceMeters(input.lat, input.lng, targetStop.lat, targetStop.lng);
    if (distanceToStop <= this.trackingPolicy.geofenceDeviationMeters) return;
    if ((input.speed ?? 0) < 8) return;

    const deviationKey = `${key}:ROUTE_DEVIATION`;
    const lastDeviationAlert = this.lastGeoAlertByKey.get(deviationKey) ?? 0;
    if (nowMs - lastDeviationAlert < cooldownMs) return;
    this.lastGeoAlertByKey.set(deviationKey, nowMs);
    this.logger.warn(
      `[TRACKING] [GEOFENCE] route deviation routeId=${input.routeId} vehicleId=${input.vehicleId} distanceToNextStop=${Math.round(distanceToStop)}m stop=${targetStop.name}`,
    );
    await this.registerGeoFenceEvent(tenantId, {
      vehicleId: input.vehicleId,
      eventType: 'ROUTE_DEVIATION',
      lat: input.lat,
      lng: input.lng,
      routeId: input.routeId,
      locationName: targetStop.name,
    });
    this.opsGateway.emitToTenant(tenantId, 'route:deviation', {
      routeId: input.routeId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      targetStopId: targetStop.id,
      targetStopName: targetStop.name,
      distanceMeters: Math.round(distanceToStop),
      nearestHospitalDistanceMeters: nearest == null ? null : Math.round(nearest.distance),
      timestamp: input.timestamp.toISOString(),
    });
    if (this.trackingPolicy.geofenceAlertsEnabled) {
      this.opsGateway.emitAlert(tenantId, {
        type: 'ROUTE_DEVIATION',
        message: `Desvio de rota detectado (${Math.round(distanceToStop)}m da próxima parada).`,
        severity: 'warning',
        data: {
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          targetStopId: targetStop.id,
          targetStopName: targetStop.name,
          distanceMeters: Math.round(distanceToStop),
        },
      });
    }
  }

  private downsampleReplayPoints<T extends { timestamp: Date }>(points: T[], maxPoints: number): T[] {
    if (points.length <= maxPoints) return points;
    if (maxPoints <= 2) return [points[0], points[points.length - 1]];
    const sampled: T[] = [];
    const step = (points.length - 1) / (maxPoints - 1);
    for (let i = 0; i < maxPoints; i += 1) {
      const idx = Math.round(i * step);
      sampled.push(points[Math.min(idx, points.length - 1)]);
    }
    return sampled;
  }

  private computeReplayMetrics(
    route: { scheduledAt: Date | null; date: Date },
    points: Array<{ timestamp: Date; speed: number | null }>,
  ) {
    if (points.length === 0) {
      return {
        pointCount: 0,
        durationSeconds: 0,
        stoppedSeconds: 0,
        stoppedMinutes: 0,
        gpsGapCount: 0,
        gpsGapSeconds: 0,
        delayMinutes: 0,
      };
    }
    const firstTs = new Date(points[0].timestamp).getTime();
    const lastTs = new Date(points[points.length - 1].timestamp).getTime();
    let stoppedSeconds = 0;
    let gpsGapCount = 0;
    let gpsGapSeconds = 0;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const cur = points[i];
      const dt = Math.max(0, (new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000);
      if ((prev.speed ?? 0) < 2) stoppedSeconds += dt;
      if (dt > 90) {
        gpsGapCount += 1;
        gpsGapSeconds += dt;
      }
    }
    const scheduledBase = route.scheduledAt ? new Date(route.scheduledAt).getTime() : new Date(route.date).getTime();
    const delayMinutes = Math.max(0, Math.round((firstTs - scheduledBase) / 60000));

    return {
      pointCount: points.length,
      durationSeconds: Math.max(0, Math.round((lastTs - firstTs) / 1000)),
      stoppedSeconds: Math.round(stoppedSeconds),
      stoppedMinutes: Math.round(stoppedSeconds / 60),
      gpsGapCount,
      gpsGapSeconds: Math.round(gpsGapSeconds),
      delayMinutes,
    };
  }

  private async evaluateGeofenceIntelligence(tenantId: string, input: {
    routeId: string | null;
    vehicleId: string;
    driverId: string | null;
    lat: number;
    lng: number;
    speed: number | null;
    timestamp: Date;
  }) {
    const key = this.gpsCacheKey(tenantId, input.vehicleId, input.routeId);
    const nowMs = input.timestamp.getTime();
    const evalMinMs = this.trackingPolicy.geofenceMinEvaluationMs;
    const lastEval = this.lastGeoEvalByKey.get(key);
    if (lastEval != null && nowMs - lastEval < evalMinMs) return;
    this.lastGeoEvalByKey.set(key, nowMs);
    if ((input.speed ?? 0) >= 3) {
      this.lastMovingByKey.set(key, nowMs);
    }

    const nearby = await this.prisma.healthcareLocation.findMany({
      where: {
        tenantId,
        active: true,
        latitude: { not: null, gte: input.lat - 0.02, lte: input.lat + 0.02 },
        longitude: { not: null, gte: input.lng - 0.02, lte: input.lng + 0.02 },
      },
      select: { id: true, name: true, latitude: true, longitude: true, type: true },
      take: 25,
    });
    let nearest: { id: string; name: string; distance: number; type: string } | null = null;
    for (const loc of nearby) {
      if (loc.latitude == null || loc.longitude == null) continue;
      const dist = distanceMeters(input.lat, input.lng, loc.latitude, loc.longitude);
      if (!nearest || dist < nearest.distance) {
        nearest = { id: loc.id, name: loc.name, distance: dist, type: loc.type };
      }
    }
    if (!nearest) {
      await this.detectLongStopAndDeviation(tenantId, input, null, key);
      return;
    }

    const arrivalRadius = this.trackingPolicy.geofenceArrivalRadiusMeters;
    const departureRadius = this.trackingPolicy.geofenceDepartureRadiusMeters;
    const isNearHospital = nearest.distance <= arrivalRadius;
    const isAwayFromHospital = nearest.distance >= departureRadius;
    const lastGeoEvent = await this.prisma.geoFenceEvent.findFirst({
      where: { tenantId, vehicleId: input.vehicleId, routeId: input.routeId ?? undefined },
      orderBy: { detectedAt: 'desc' },
      select: { eventType: true, locationId: true, detectedAt: true },
    });

    if (isNearHospital) {
      this.logger.log(`[TRACKING] [OPS] [GEOFENCE] hospital proximity routeId=${input.routeId ?? '-'} vehicleId=${input.vehicleId} location=${nearest.name} distance=${nearest.distance.toFixed(0)}m`);
      this.opsGateway.emitToTenant(tenantId, 'geofence:hospital_proximity', {
        routeId: input.routeId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        locationId: nearest.id,
        locationName: nearest.name,
        locationType: nearest.type,
        distanceMeters: Math.round(nearest.distance),
        timestamp: input.timestamp.toISOString(),
      });

      const shouldMarkArrival =
        lastGeoEvent?.eventType !== 'ARRIVED_AT_DESTINATION'
        || lastGeoEvent.locationId !== nearest.id;
      if (shouldMarkArrival) {
        await this.registerGeoFenceEvent(tenantId, {
          vehicleId: input.vehicleId,
          eventType: 'ARRIVED_AT_DESTINATION',
          lat: input.lat,
          lng: input.lng,
          routeId: input.routeId ?? undefined,
          locationId: nearest.id,
          locationName: nearest.name,
        });
        this.opsGateway.emitToTenant(tenantId, 'geofence:arrival', {
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          driverId: input.driverId,
          locationId: nearest.id,
          locationName: nearest.name,
          distanceMeters: Math.round(nearest.distance),
          timestamp: input.timestamp.toISOString(),
        });
      }

      if ((input.speed ?? 0) < 6) {
        this.opsGateway.emitToTenant(tenantId, 'route:progression_suggestion', {
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          suggestedState: 'ARRIVED',
          reason: 'HOSPITAL_PROXIMITY',
          distanceMeters: Math.round(nearest.distance),
          timestamp: input.timestamp.toISOString(),
        });
        if (this.trackingPolicy.geofenceAlertsEnabled) {
          this.opsGateway.emitAlert(tenantId, {
            type: 'HOSPITAL_PROXIMITY',
            message: `Sugestão operacional: confirmar CHEGADA em ${nearest.name}.`,
            severity: 'info',
            data: {
              routeId: input.routeId,
              vehicleId: input.vehicleId,
              locationName: nearest.name,
              distanceMeters: Math.round(nearest.distance),
            },
          });
        }
        await this.tryAutoArrive(tenantId, input);
      }
    } else if (isAwayFromHospital && lastGeoEvent?.eventType === 'ARRIVED_AT_DESTINATION') {
      await this.registerGeoFenceEvent(tenantId, {
        vehicleId: input.vehicleId,
        eventType: 'LEFT_DESTINATION',
        lat: input.lat,
        lng: input.lng,
        routeId: input.routeId ?? undefined,
        locationId: nearest.id,
        locationName: nearest.name,
      });
      this.logger.log(`[TRACKING] [OPS] [GEOFENCE] departure detected routeId=${input.routeId ?? '-'} vehicleId=${input.vehicleId} location=${nearest.name} distance=${nearest.distance.toFixed(0)}m`);
      this.opsGateway.emitToTenant(tenantId, 'geofence:departure', {
        routeId: input.routeId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        locationId: nearest.id,
        locationName: nearest.name,
        distanceMeters: Math.round(nearest.distance),
        timestamp: input.timestamp.toISOString(),
      });
    }

    await this.detectLongStopAndDeviation(tenantId, input, nearest, key);
  }
}
