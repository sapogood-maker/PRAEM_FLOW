import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsGateway } from '../../gateways/operations.gateway';
import { sanitizePayload } from '../../common/sanitize';
import { AuditService } from '../audit/audit.service';

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
// Max rows to retain per vehicle before compaction
const TRACKING_RETENTION_HOURS = 24;

function deriveOperationalStatus(speed?: number | null, online?: boolean): string {
  if (!online) return 'OFFLINE';
  if (!speed || speed < 2) return 'IDLE';
  return 'MOVING';
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsGateway: OperationsGateway,
    private readonly audit: AuditService,
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

    // Persist tracking record
    const record = await this.prisma.vehicleTracking.create({
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
    });
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
        } as any,
      },
    });

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
    return record;
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

  /**
   * Smart retention — delete tracking rows older than TRACKING_RETENTION_HOURS.
   * Keeps the most recent record per vehicle as a snapshot.
   */
  async cleanup(tenantId: string) {
    const cutoff = new Date(Date.now() - TRACKING_RETENTION_HOURS * 60 * 60 * 1000);

    // Get latest record IDs to preserve
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
        timestamp: { lt: cutoff },
        id: { notIn: keepIds },
      },
    });
    const trackingPointDeleted = await this.prisma.trackingPoint.deleteMany({
      where: {
        tenantId,
        timestamp: { lt: cutoff },
      },
    });

    return { deletedRows: deleted.count, deletedTrackingPoints: trackingPointDeleted.count, cutoff: cutoff.toISOString() };
  }

  // Legacy in-memory methods kept for backward-compat
  vehicles() {
    return [];
  }

  vehicleById(_vehicleId: string) {
    return null;
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
    if (!nearest) return;
    if (nearest.distance <= 250) {
      this.logger.log(`[TRACKING] [OPS] geofence proximity routeId=${input.routeId ?? '-'} vehicleId=${input.vehicleId} location=${nearest.name} distance=${nearest.distance.toFixed(0)}m`);
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
      if ((input.speed ?? 0) < 5) {
        this.opsGateway.emitToTenant(tenantId, 'route:progression_suggestion', {
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          suggestedState: 'ARRIVED',
          reason: 'HOSPITAL_PROXIMITY',
          distanceMeters: Math.round(nearest.distance),
          timestamp: input.timestamp.toISOString(),
        });
      }
    }
  }
}
