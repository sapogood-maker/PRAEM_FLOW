import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { sanitizePayload } from '../common/sanitize';
import { PrismaService } from '../prisma/prisma.service';
import {
  distanceMeters,
  loadTrackingPolicy,
  shouldPersistTrackingPoint,
  shouldThrottleGps,
} from '../modules/tracking/tracking-policy';

type SocketAuthUser = {
  userId: string;
  tenantId: string;
  role: string;
  driverId?: string | null;
};

/**
 * OperationsGateway — dedicated /operations namespace.
 * All operational domain events are isolated here.
 * Domain prefixes: vehicle.* | patient.* | queue.* | trip.* | route.* | driver.* | qr.*
 */
@WebSocketGateway({ namespace: '/operations', cors: { origin: '*' } })
export class OperationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(OperationsGateway.name);
  private readonly trackingPolicy = loadTrackingPolicy();
  private readonly lastIngestByKey = new Map<string, number>();
  private readonly lastPersistedPointByKey = new Map<string, { lat: number; lng: number; heading: number | null; timestamp: Date }>();
  private readonly lastPayloadTimestampByKey = new Map<string, number>();
  private readonly lastGeoEvalByKey = new Map<string, number>();
  private readonly lastGeoAlertByKey = new Map<string, number>();
  private readonly lastMovingByKey = new Map<string, number>();

  private connectedClients = new Set<string>();
  private socketUsers = new Map<string, SocketAuthUser>();

  /** socket.id → { driverId, tenantId } for disconnect tracking */
  private driverSockets = new Map<string, { driverId: string; tenantId: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: Socket) {
    const authUser = this.authenticateSocket(client);
    if (!authUser) {
      this.logger.warn('[WEBSOCKET] unauthorized connection rejected');
      client.disconnect(true);
      return;
    }
    this.socketUsers.set(client.id, authUser);
    this.connectedClients.add(client.id);
    client.join(`tenant:${authUser.tenantId}`);
    this.logger.log(`[WEBSOCKET] connected socketId=${client.id} tenantId=${authUser.tenantId} role=${authUser.role} driverId=${authUser.driverId ?? '-'}`);
  }

  async handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.socketUsers.delete(client.id);
    const info = this.driverSockets.get(client.id);
    if (info) {
      this.driverSockets.delete(client.id);
      // Emit driver.offline only if no other socket for the same driver remains
      const stillConnected = [...this.driverSockets.values()].some(v => v.driverId === info.driverId);
      if (!stillConnected) {
        this.logger.log(`[SOCKET] driver offline driverId=${info.driverId} tenantId=${info.tenantId}`);
        this.server.to(`tenant:${info.tenantId}`).emit('driver.offline', sanitizePayload({
          driverId: info.driverId,
          tenantId: info.tenantId,
          timestamp: new Date().toISOString(),
        }));
      }
    }
  }

  get clientCount() {
    return this.connectedClients.size;
  }

  // ─── Room management ─────────────────────────────────────────────────────

  @SubscribeMessage('join:tenant')
  onJoinTenant(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const tenantId = typeof safe['tenantId'] === 'string' ? safe['tenantId'] : user.tenantId;
    if (tenantId !== user.tenantId) return { ok: false, error: 'forbidden' };
    client.join(`tenant:${tenantId}`);
    return { ok: true };
  }

  @SubscribeMessage('leave:tenant')
  onLeaveTenant(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const tenantId = typeof safe['tenantId'] === 'string' ? safe['tenantId'] : user.tenantId;
    if (tenantId !== user.tenantId) return { ok: false, error: 'forbidden' };
    client.leave(`tenant:${tenantId}`);
    return { ok: true };
  }

  /**
   * join:driver — used by Flutter tablet terminals.
   * Joins the tenant room AND a driver-specific room so the dispatcher
   * can push targeted events to a single driver/tablet.
   * Also records the WS connection time on the Driver record.
   */
  @SubscribeMessage('join:driver')
  async onJoinDriver(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const tenantId = user.tenantId;
    let driverId = typeof safe['driverId'] === 'string'
      ? safe['driverId']
      : (user.driverId ?? null);
    const deviceId = safe['deviceId'];
    if (user.role === 'DRIVER') {
      if (!driverId) {
        const ownDriver = await this.prisma.driver.findFirst({
          where: { tenantId, userId: user.userId },
          select: { id: true },
        });
        driverId = ownDriver?.id ?? null;
      }

      if (user.driverId && driverId !== user.driverId) {
        this.logger.warn(`[SOCKET] join:driver forbidden socketId=${client.id} userDriverId=${user.driverId} requestedDriverId=${driverId ?? '-'}`);
        return { ok: false, error: 'forbidden' };
      }

      if (driverId) {
        const belongsToUser = await this.prisma.driver.findFirst({
          where: { id: driverId, tenantId, userId: user.userId },
          select: { id: true },
        });
        if (!belongsToUser) {
          this.logger.warn(`[SOCKET] join:driver forbidden ownership socketId=${client.id} userId=${user.userId} requestedDriverId=${driverId}`);
          return { ok: false, error: 'forbidden' };
        }
      }
    }
    this.logger.log(`[WEBSOCKET] join:driver socketId=${client.id} tenantId=${tenantId} driverId=${driverId ?? '-'} deviceId=${typeof deviceId === 'string' ? deviceId : '-'}`);

    client.join(`tenant:${tenantId}`);
    if (typeof driverId === 'string') client.join(`driver:${driverId}`);
    if (typeof deviceId === 'string') client.join(`device:${deviceId}`);

    // Record WS connection timestamp for operational status tracking
    if (typeof driverId === 'string') {
      this.socketUsers.set(client.id, { ...user, driverId });
      this.driverSockets.set(client.id, { driverId, tenantId });
      const now = new Date();
      try {
        await this.prisma.driver.updateMany({
          where: { id: driverId, tenantId },
          data: { wsLastSeenAt: now },
        });
        this.logger.log(`[WS CONNECTED] driverId=${driverId} tenantId=${tenantId}`);
      } catch (err) {
        this.logger.error(`[WS CONNECTED] DB update failed for driverId=${driverId}: ${(err as Error).message}`);
      }
      this.server.to(`tenant:${tenantId}`).emit('driver.connected', sanitizePayload({
        driverId,
        tenantId,
        timestamp: now.toISOString(),
      }));
      await this.emitStateReplay(client, tenantId, driverId);
    }

    return { ok: true };
  }

  @SubscribeMessage('ops:state:request')
  async onStateRequest(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const requestedDriverId = typeof safe['driverId'] === 'string' ? safe['driverId'] : user.driverId ?? null;
    if (user.role === 'DRIVER' && requestedDriverId && requestedDriverId !== user.driverId) {
      this.logger.warn(`[SOCKET] ops:state:request forbidden socketId=${client.id} userDriverId=${user.driverId ?? '-'} requestedDriverId=${requestedDriverId}`);
      return { ok: false, error: 'forbidden' };
    }
    this.logger.log(`[WEBSOCKET] ops:state:request socketId=${client.id} tenantId=${user.tenantId} driverId=${requestedDriverId ?? '-'}`);
    await this.emitStateReplay(client, user.tenantId, requestedDriverId);
    return { ok: true };
  }

  @SubscribeMessage('ops:ping')
  onOpsPing(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    this.logger.debug(`[SOCKET] ops:ping socketId=${client.id} pingId=${safe['pingId'] ?? '-'}`);
    client.emit('ops:pong', sanitizePayload({
      at: new Date().toISOString(),
      pingId: safe['pingId'] ?? null,
    }));
    return { ok: true };
  }

  /**
   * driver.heartbeat — sent by Flutter every 30 s to signal the tablet is alive.
   * Updates both wsLastSeenAt and lastHeartbeatAt on the Driver record and
   * emits driver.gps.active to the tenant room.
   */
  @SubscribeMessage('driver.heartbeat')
  async onDriverHeartbeat(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const tenantId = user.tenantId;
    const driverId = typeof safe['driverId'] === 'string' ? safe['driverId'] : user.driverId ?? null;
    if (user.role === 'DRIVER' && user.driverId && driverId !== user.driverId) {
      return { ok: false, error: 'forbidden' };
    }

    if (tenantId) {
      this.server.to(`tenant:${tenantId}`).emit('driver.heartbeat', sanitizePayload({ ...safe, tenantId, driverId }));
    }

    if (driverId && tenantId) {
      const now = new Date();
      try {
        await this.prisma.driver.updateMany({
          where: { id: driverId, tenantId },
          data: { lastHeartbeatAt: now, wsLastSeenAt: now },
        });
        this.logger.log(`[GPS HEARTBEAT] driverId=${driverId} tenantId=${tenantId} lat=${safe['lat']} lng=${safe['lng']}`);
      } catch (err) {
        this.logger.error(`[GPS HEARTBEAT] DB update failed for driverId=${driverId}: ${(err as Error).message}`);
      }
      this.server.to(`tenant:${tenantId}`).emit('driver.gps.active', sanitizePayload({
        driverId,
        tenantId,
        timestamp: now.toISOString(),
        lat: safe['lat'],
        lng: safe['lng'],
        batteryLevel: safe['batteryLevel'],
      }));
    }

    return { ok: true };
  }

  @SubscribeMessage('driver:location:update')
  async onDriverLocationUpdate(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    if (!this.canEmitDriverEvent(user, safe)) {
      this.logger.warn(`[SOCKET] forbidden driver:location:update socketId=${client.id} tenantId=${user.tenantId} userDriverId=${user.driverId ?? '-'} payloadDriverId=${typeof safe['driverId'] === 'string' ? safe['driverId'] : '-'}`);
      return { ok: false, error: 'forbidden' };
    }
    const boundDriverId = this.driverSockets.get(client.id)?.driverId ?? null;
    const driverId = user.driverId ?? (typeof safe['driverId'] === 'string' ? safe['driverId'] : null) ?? boundDriverId;
    const vehicleId = typeof safe['vehicleId'] === 'string' ? safe['vehicleId'] : null;
    const routeId = typeof safe['routeId'] === 'string' ? safe['routeId'] : null;
    const lat = Number(safe['lat']);
    const lng = Number(safe['lng']);
    const speed = safe['speed'] == null ? null : Number(safe['speed']);
    const heading = safe['heading'] == null ? null : Number(safe['heading']);
    const accuracy = safe['accuracy'] == null ? null : Number(safe['accuracy']);
    const batteryLevel = safe['batteryLevel'] == null ? null : Number(safe['batteryLevel']);
    if (!vehicleId || Number.isNaN(lat) || Number.isNaN(lng)) {
      return { ok: false, error: 'invalid_payload' };
    }
    const key = `${user.tenantId}:${vehicleId}:${routeId ?? '-'}`;
    const payloadTimestamp = typeof safe['timestamp'] === 'string' ? new Date(safe['timestamp']) : null;
    const cachedLatestTs = this.lastPayloadTimestampByKey.get(key);
    let latestTimestampMs = cachedLatestTs ?? null;
    if (latestTimestampMs == null) {
      const latestForVehicle = await this.prisma.vehicleTracking.findFirst({
        where: { tenantId: user.tenantId, vehicleId },
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true },
      });
      latestTimestampMs = latestForVehicle?.timestamp ? new Date(latestForVehicle.timestamp).getTime() : null;
      if (latestTimestampMs != null) this.lastPayloadTimestampByKey.set(key, latestTimestampMs);
    }
    if (
      payloadTimestamp
      && !Number.isNaN(payloadTimestamp.getTime())
      && latestTimestampMs != null
      && payloadTimestamp.getTime() + 5_000 < latestTimestampMs
    ) {
      this.logger.warn(`[CONFLICT] [GPS] stale gps update rejected tenantId=${user.tenantId} vehicleId=${vehicleId} incoming=${payloadTimestamp.toISOString()} latest=${new Date(latestTimestampMs).toISOString()}`);
      return { ok: false, error: 'stale_update' };
    }

    const now = new Date();
    const nowMs = now.getTime();
    const throttled = shouldThrottleGps(this.lastIngestByKey.get(key), nowMs, this.trackingPolicy.floodMinIntervalMs);
    if (throttled) {
      this.logger.warn(`[TRACKING] [GPS] [FLOOD_PROTECTION] ws update throttled tenantId=${user.tenantId} vehicleId=${vehicleId} routeId=${routeId ?? '-'} minIntervalMs=${this.trackingPolicy.floodMinIntervalMs}`);
    }
    const operationalStatus = speed != null && !Number.isNaN(speed) && speed >= 2 ? 'MOVING' : 'IDLE';
    if ((speed ?? 0) >= 3) {
      this.lastMovingByKey.set(key, nowMs);
    }

    this.logger.log(`[TRACKING] [OPS] [GPS] driver update tenantId=${user.tenantId} driverId=${driverId ?? '-'} vehicleId=${vehicleId} routeId=${routeId ?? '-'} lat=${lat} lng=${lng}`);
    if (!throttled) {
      await this.prisma.vehicleTracking.create({
        data: {
          tenantId: user.tenantId,
          vehicleId,
          driverId,
          routeId,
          lat,
          lng,
          speed: speed != null && !Number.isNaN(speed) ? speed : null,
          heading: heading != null && !Number.isNaN(heading) ? heading : null,
          accuracy: accuracy != null && !Number.isNaN(accuracy) ? accuracy : null,
          batteryLevel: batteryLevel != null && !Number.isNaN(batteryLevel) ? batteryLevel : null,
          online: true,
          operationalStatus: operationalStatus as any,
          lastHeartbeatAt: now,
          timestamp: now,
        },
      });
      this.lastIngestByKey.set(key, nowMs);
      this.lastPayloadTimestampByKey.set(key, payloadTimestamp && !Number.isNaN(payloadTimestamp.getTime()) ? payloadTimestamp.getTime() : nowMs);

      let lastPersisted = this.lastPersistedPointByKey.get(key) ?? null;
      if (!lastPersisted) {
        const latestPoint = await this.prisma.trackingPoint.findFirst({
          where: { tenantId: user.tenantId, vehicleId, routeId },
          orderBy: { timestamp: 'desc' },
          select: { lat: true, lng: true, heading: true, timestamp: true },
        });
        if (latestPoint) {
          lastPersisted = {
            lat: latestPoint.lat,
            lng: latestPoint.lng,
            heading: latestPoint.heading ?? null,
            timestamp: latestPoint.timestamp,
          };
          this.lastPersistedPointByKey.set(key, lastPersisted);
        }
      }

      const persistDecision = shouldPersistTrackingPoint(
        lastPersisted,
        { lat, lng, heading: heading != null && !Number.isNaN(heading) ? heading : null, timestamp: now },
        this.trackingPolicy,
      );
      if (persistDecision.persist) {
        await this.prisma.trackingPoint.create({
          data: {
            tenantId: user.tenantId,
            routeId,
            driverId,
            vehicleId,
            lat,
            lng,
            speed: speed != null && !Number.isNaN(speed) ? speed : null,
            heading: heading != null && !Number.isNaN(heading) ? heading : null,
            timestamp: now,
          },
        });
        await this.prisma.operationalTimeline.create({
          data: {
            tenantId: user.tenantId,
            routeId,
            driverId,
            vehicleId,
            eventType: 'GPS_CHECKPOINT',
            source: 'WS_DRIVER_LOCATION',
            metadata: { lat, lng, speed, heading, timestamp: now.toISOString(), persistedBy: persistDecision.reason } as any,
          },
        });
        this.lastPersistedPointByKey.set(key, { lat, lng, heading: heading != null && !Number.isNaN(heading) ? heading : null, timestamp: now });
        this.logger.log(`[TRACKING] [GPS] ws persisted checkpoint tenantId=${user.tenantId} vehicleId=${vehicleId} routeId=${routeId ?? '-'} reason=${persistDecision.reason} dist=${persistDecision.distanceMeters.toFixed(1)}m dt=${persistDecision.elapsedSeconds.toFixed(1)}s`);
      } else {
        this.logger.debug(`[TRACKING] [GPS] ws skipped checkpoint tenantId=${user.tenantId} vehicleId=${vehicleId} routeId=${routeId ?? '-'} dist=${persistDecision.distanceMeters.toFixed(1)}m dt=${persistDecision.elapsedSeconds.toFixed(1)}s hdg=${persistDecision.headingDelta.toFixed(1)}`);
      }
    }
    if (driverId) {
      await this.prisma.driver.updateMany({
        where: { tenantId: user.tenantId, id: driverId },
        data: { lat, lng, lastHeartbeatAt: now, wsLastSeenAt: now },
      });
    }
    await this.evaluateGeofenceIntelligence(user.tenantId, {
      routeId,
      vehicleId,
      driverId,
      lat,
      lng,
      speed,
      timestamp: now,
    });

    const room = `tenant:${user.tenantId}`;
    const broadcast = {
      vehicleId,
      driverId,
      routeId,
      tenantId: user.tenantId,
      lat,
      lng,
      speed,
      heading,
      accuracy,
      batteryLevel,
      online: true,
      operationalStatus,
      timestamp: now.toISOString(),
    };
    this.logger.log(`[WEBSOCKET] broadcast driver:location:update tenantId=${user.tenantId} vehicleId=${vehicleId} routeId=${routeId ?? '-'}`);
    this.logger.log(`[MAP] broadcast location tenantId=${user.tenantId} vehicleId=${vehicleId} routeId=${routeId ?? '-'} operationalStatus=${operationalStatus}`);
    this.server.to(room).emit('driver:location:update', broadcast);
    this.server.to(room).emit('vehicle.location_updated', broadcast);
    if (driverId) {
      this.server.to(room).emit('driver.gps.active', sanitizePayload({
        driverId,
        tenantId: user.tenantId,
        routeId,
        vehicleId,
        lat,
        lng,
        timestamp: now.toISOString(),
      }));
    }
    return { ok: true };
  }

  /** driver.status_changed — motorista altera status (embarque, trânsito, etc.). */
  @SubscribeMessage('driver.status_changed')
  onDriverStatus(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    if (!this.canEmitDriverEvent(user, safe)) return { ok: false, error: 'forbidden' };
    this.logger.log(`[SOCKET] driver.status_changed received tenantId=${user.tenantId} driverId=${safe['driverId'] ?? '-'} routeId=${safe['routeId'] ?? '-'} status=${safe['status'] ?? '-'}`);
    const room = `tenant:${user.tenantId}`;
    if (room) this.server.to(room).emit('driver.status_changed', safe);
    return { ok: true };
  }

  // ─── Vehicle domain ───────────────────────────────────────────────────────

  @SubscribeMessage('vehicle.location_updated')
  onVehicleLocation(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('vehicle.location_updated', payload, client);
  }

  @SubscribeMessage('vehicle.status_changed')
  onVehicleStatus(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('vehicle.status_changed', payload, client);
  }

  @SubscribeMessage('vehicle.heartbeat')
  onVehicleHeartbeat(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = `tenant:${user.tenantId}`;
    if (room) {
      this.server.to(room).emit('vehicle.heartbeat', safe);
      this.server.to(room).emit('vehicle.location_updated', sanitizePayload({
        vehicleId: safe['vehicleId'],
        driverId: safe['driverId'],
        routeId: safe['routeId'],
        lat: safe['lat'],
        lng: safe['lng'],
        speed: safe['speed'],
        heading: safe['heading'],
        batteryLevel: safe['batteryLevel'] ?? safe['battery'],
        operationalStatus: safe['operationalStatus'],
        timestamp: safe['timestamp'],
      }));
      this.server.to(room).emit('driver:location:update', sanitizePayload({
        vehicleId: safe['vehicleId'],
        driverId: safe['driverId'],
        routeId: safe['routeId'],
        lat: safe['lat'],
        lng: safe['lng'],
        speed: safe['speed'],
        heading: safe['heading'],
        batteryLevel: safe['batteryLevel'] ?? safe['battery'],
        operationalStatus: safe['operationalStatus'],
        timestamp: safe['timestamp'],
      }));
    }
    return { ok: true };
  }

  @SubscribeMessage('vehicle.online')
  onVehicleOnline(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('vehicle.online', payload, client);
  }

  @SubscribeMessage('vehicle.offline')
  onVehicleOffline(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('vehicle.offline', payload, client);
  }

  @SubscribeMessage('vehicle.idle')
  onVehicleIdle(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('vehicle.idle', payload, client);
  }

  // ─── Patient domain ───────────────────────────────────────────────────────

  @SubscribeMessage('patient.checked_in')
  onPatientCheckedIn(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('patient.checked_in', payload, client);
  }

  @SubscribeMessage('patient.boarded')
  onPatientBoarded(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('patient.boarded', payload, client);
  }

  @SubscribeMessage('patient.arrived')
  onPatientArrived(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('patient.arrived', payload, client);
  }

  @SubscribeMessage('patient.missed')
  onPatientMissed(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('patient.missed', payload, client);
  }

  // ─── Queue domain ─────────────────────────────────────────────────────────

  @SubscribeMessage('queue.priority_changed')
  onQueuePriorityChanged(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('queue.priority_changed', payload, client);
  }

  @SubscribeMessage('queue.updated')
  onQueueUpdated(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('queue.updated', payload, client);
  }

  // ─── Trip domain ──────────────────────────────────────────────────────────

  @SubscribeMessage('trip.status_changed')
  onTripStatus(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('trip.status_changed', payload, client);
  }

  @SubscribeMessage('trip.started')
  onTripStarted(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('trip.started', payload, client);
  }

  @SubscribeMessage('trip.completed')
  onTripCompleted(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('trip.completed', payload, client);
  }

  // ─── Route domain ─────────────────────────────────────────────────────────

  @SubscribeMessage('route.optimized')
  onRouteOptimized(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('route.optimized', payload, client);
  }

  @SubscribeMessage('route.status_changed')
  onRouteStatus(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('route.status_changed', payload, client);
  }

  // ─── QR domain ───────────────────────────────────────────────────────────

  @SubscribeMessage('qr.invalid_detected')
  onQrInvalid(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    return this.emitTenantScoped('qr.invalid_detected', payload, client);
  }

  // ─── Server-side emit helpers ─────────────────────────────────────────────

  emitToTenant(tenantId: string, event: string, payload: Record<string, unknown>) {
    this.logger.log(`[SOCKET] emit tenant event=${event} tenantId=${tenantId}`);
    this.server.to(`tenant:${tenantId}`).emit(event, sanitizePayload(payload));
  }

  emitToDriver(driverId: string, event: string, payload: Record<string, unknown>) {
    this.logger.log(`[SOCKET] emit driver event=${event} driverId=${driverId}`);
    this.server.to(`driver:${driverId}`).emit(event, sanitizePayload(payload));
  }

  /** Emit an alert to the tenant room. */
  emitAlert(tenantId: string, alert: { type: string; message: string; severity: string; data?: unknown }) {
    this.server.to(`tenant:${tenantId}`).emit('operational.alert', sanitizePayload(alert));
  }

  private getSocketUser(client: Socket) {
    return this.socketUsers.get(client.id) ?? null;
  }

  private authenticateSocket(client: Socket): SocketAuthUser | null {
    const authToken = client.handshake.auth?.token as string | undefined;
    const headerToken = client.handshake.headers.authorization?.replace('Bearer ', '');
    const rawToken = authToken ?? headerToken;
    if (!rawToken) return null;
    try {
      const decoded = this.jwtService.verify(rawToken, {
        secret: process.env.JWT_SECRET ?? 'change_me_jwt',
      }) as Record<string, unknown>;
      const tenantId = typeof decoded['tenantId'] === 'string' ? decoded['tenantId'] : null;
      const userId = typeof decoded['sub'] === 'string'
        ? decoded['sub']
        : (typeof decoded['userId'] === 'string' ? decoded['userId'] : null);
      const role = typeof decoded['role'] === 'string' ? decoded['role'] : null;
      if (!tenantId || !userId || !role) return null;
      const driverId = typeof decoded['driverId'] === 'string' ? decoded['driverId'] : null;
      return { tenantId, userId, role, driverId };
    } catch {
      return null;
    }
  }

  private canEmitDriverEvent(user: SocketAuthUser, payload: Record<string, unknown>) {
    const payloadTenantId = typeof payload['tenantId'] === 'string' ? payload['tenantId'] : user.tenantId;
    const payloadDriverId = typeof payload['driverId'] === 'string' ? payload['driverId'] : null;
    if (payloadTenantId !== user.tenantId) return false;
    if (user.role === 'DRIVER') {
      if (!user.driverId) return payloadDriverId !== null;
      if (!payloadDriverId) return true;
      return payloadDriverId === user.driverId;
    }
    return true;
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
    const key = `${tenantId}:${input.vehicleId}:${input.routeId ?? '-'}`;
    const nowMs = input.timestamp.getTime();
    const lastEval = this.lastGeoEvalByKey.get(key);
    if (lastEval != null && nowMs - lastEval < this.trackingPolicy.geofenceMinEvaluationMs) return;
    this.lastGeoEvalByKey.set(key, nowMs);

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

    const lastGeoEvent = await this.prisma.geoFenceEvent.findFirst({
      where: { tenantId, vehicleId: input.vehicleId, routeId: input.routeId ?? undefined },
      orderBy: { detectedAt: 'desc' },
      select: { eventType: true, locationId: true },
    });

    if (nearest && nearest.distance <= this.trackingPolicy.geofenceArrivalRadiusMeters) {
      const shouldMarkArrival =
        lastGeoEvent?.eventType !== 'ARRIVED_AT_DESTINATION'
        || lastGeoEvent.locationId !== nearest.id;
      if (shouldMarkArrival) {
        await this.prisma.geoFenceEvent.create({
          data: {
            tenantId,
            vehicleId: input.vehicleId,
            routeId: input.routeId,
            eventType: 'ARRIVED_AT_DESTINATION',
            locationId: nearest.id,
            locationName: nearest.name,
            lat: input.lat,
            lng: input.lng,
          },
        });
        this.server.to(`tenant:${tenantId}`).emit('geofence:arrival', sanitizePayload({
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          driverId: input.driverId,
          locationId: nearest.id,
          locationName: nearest.name,
          distanceMeters: Math.round(nearest.distance),
          timestamp: input.timestamp.toISOString(),
        }));
      }
      this.logger.log(`[TRACKING] [GEOFENCE] proximity routeId=${input.routeId ?? '-'} vehicleId=${input.vehicleId} location=${nearest.name} distance=${nearest.distance.toFixed(0)}m`);
      this.server.to(`tenant:${tenantId}`).emit('geofence:hospital_proximity', sanitizePayload({
        routeId: input.routeId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        locationId: nearest.id,
        locationName: nearest.name,
        locationType: nearest.type,
        distanceMeters: Math.round(nearest.distance),
        timestamp: input.timestamp.toISOString(),
      }));
      const cooldownMs = this.trackingPolicy.geofenceAlertCooldownSeconds * 1000;
      const suggestionKey = `${key}:ARRIVAL_SUGGESTION`;
      const lastSuggestion = this.lastGeoAlertByKey.get(suggestionKey) ?? 0;
      if ((input.speed ?? 0) < 6 && nowMs - lastSuggestion >= cooldownMs) {
        this.lastGeoAlertByKey.set(suggestionKey, nowMs);
        this.server.to(`tenant:${tenantId}`).emit('route:progression_suggestion', sanitizePayload({
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          suggestedState: 'ARRIVED',
          reason: 'HOSPITAL_PROXIMITY',
          distanceMeters: Math.round(nearest.distance),
          timestamp: input.timestamp.toISOString(),
        }));
      }
    } else if (
      nearest
      && nearest.distance >= this.trackingPolicy.geofenceDepartureRadiusMeters
      && lastGeoEvent?.eventType === 'ARRIVED_AT_DESTINATION'
    ) {
      await this.prisma.geoFenceEvent.create({
        data: {
          tenantId,
          vehicleId: input.vehicleId,
          routeId: input.routeId,
          eventType: 'LEFT_DESTINATION',
          locationId: nearest.id,
          locationName: nearest.name,
          lat: input.lat,
          lng: input.lng,
        },
      });
      this.logger.log(`[TRACKING] [GEOFENCE] departure routeId=${input.routeId ?? '-'} vehicleId=${input.vehicleId} location=${nearest.name} distance=${nearest.distance.toFixed(0)}m`);
      this.server.to(`tenant:${tenantId}`).emit('geofence:departure', sanitizePayload({
        routeId: input.routeId,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        locationId: nearest.id,
        locationName: nearest.name,
        distanceMeters: Math.round(nearest.distance),
        timestamp: input.timestamp.toISOString(),
      }));
    }

    const longStopSeconds = this.trackingPolicy.geofenceLongStopSeconds;
    const lastMovingMs = this.lastMovingByKey.get(key);
    if ((input.speed ?? 0) < 2.5 && lastMovingMs != null && (nowMs - lastMovingMs) / 1000 >= longStopSeconds) {
      const cooldownMs = this.trackingPolicy.geofenceAlertCooldownSeconds * 1000;
      const stopKey = `${key}:LONG_STOP`;
      const lastStopAlert = this.lastGeoAlertByKey.get(stopKey) ?? 0;
      if (nowMs - lastStopAlert >= cooldownMs) {
        this.lastGeoAlertByKey.set(stopKey, nowMs);
        this.logger.warn(`[TRACKING] [GEOFENCE] long stop routeId=${input.routeId ?? '-'} vehicleId=${input.vehicleId} seconds=${((nowMs - lastMovingMs) / 1000).toFixed(0)}`);
        await this.prisma.geoFenceEvent.create({
          data: {
            tenantId,
            vehicleId: input.vehicleId,
            routeId: input.routeId,
            eventType: 'LONG_STOP',
            lat: input.lat,
            lng: input.lng,
          },
        });
        this.server.to(`tenant:${tenantId}`).emit('geofence:long_stop', sanitizePayload({
          routeId: input.routeId,
          vehicleId: input.vehicleId,
          driverId: input.driverId,
          longStopSeconds: Math.round((nowMs - lastMovingMs) / 1000),
          timestamp: input.timestamp.toISOString(),
        }));
        if (this.trackingPolicy.geofenceAlertsEnabled) {
          this.emitAlert(tenantId, {
            type: 'LONG_STOP',
            message: `Parada longa detectada (${Math.round((nowMs - lastMovingMs) / 60000)} min).`,
            severity: 'warning',
            data: {
              routeId: input.routeId,
              vehicleId: input.vehicleId,
              longStopSeconds: Math.round((nowMs - lastMovingMs) / 1000),
            },
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
    const targetStop = route?.trips?.[0]?.stops?.[0];
    if (targetStop?.lat == null || targetStop.lng == null || (input.speed ?? 0) < 8) return;
    const distanceToStop = distanceMeters(input.lat, input.lng, targetStop.lat, targetStop.lng);
    if (distanceToStop <= this.trackingPolicy.geofenceDeviationMeters) return;
    const deviationKey = `${key}:DEVIATION`;
    const lastDeviation = this.lastGeoAlertByKey.get(deviationKey) ?? 0;
    if (nowMs - lastDeviation < this.trackingPolicy.geofenceAlertCooldownSeconds * 1000) return;
    this.lastGeoAlertByKey.set(deviationKey, nowMs);
    this.logger.warn(`[TRACKING] [GEOFENCE] route deviation routeId=${input.routeId} vehicleId=${input.vehicleId} distance=${Math.round(distanceToStop)}m targetStop=${targetStop.name}`);
    await this.prisma.geoFenceEvent.create({
      data: {
        tenantId,
        vehicleId: input.vehicleId,
        routeId: input.routeId,
        eventType: 'ROUTE_DEVIATION',
        locationName: targetStop.name,
        lat: input.lat,
        lng: input.lng,
      },
    });
    this.server.to(`tenant:${tenantId}`).emit('route:deviation', sanitizePayload({
      routeId: input.routeId,
      vehicleId: input.vehicleId,
      driverId: input.driverId,
      targetStopId: targetStop.id,
      targetStopName: targetStop.name,
      distanceMeters: Math.round(distanceToStop),
      timestamp: input.timestamp.toISOString(),
    }));
    if (this.trackingPolicy.geofenceAlertsEnabled) {
      this.emitAlert(tenantId, {
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

  private emitTenantScoped(event: string, payload: unknown, client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    this.server.to(`tenant:${user.tenantId}`).emit(event, safe);
    return { ok: true };
  }

  private async emitStateReplay(client: Socket, tenantId: string, driverId: string | null) {
    const activeRoute = await this.prisma.route.findFirst({
      where: {
        tenantId,
        ...(driverId ? { driverId } : {}),
        status: { in: ['DISPATCHED', 'SCHEDULED', 'PLANNED', 'PREPARING', 'ACTIVE', 'RETURNING'] as any[] },
      },
      include: {
        trips: {
          include: {
            patient: true,
            stops: { orderBy: { sequence: 'asc' } },
          },
          orderBy: [{ boardedAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: { date: 'desc' },
    });

    const latestPosition = await this.prisma.vehicleTracking.findFirst({
      where: {
        tenantId,
        ...(driverId ? { driverId } : {}),
        ...(activeRoute?.vehicleId ? { vehicleId: activeRoute.vehicleId } : {}),
      },
      orderBy: { timestamp: 'desc' },
    });
    const trackingPoints = activeRoute
      ? await this.prisma.trackingPoint.findMany({
        where: { tenantId, routeId: activeRoute.id },
        orderBy: { timestamp: 'desc' },
        take: 200,
      })
      : [];

    const routeOperationalState = this.normalizeRealtimeOperationalState(
      typeof activeRoute?.operationalState === 'string' ? activeRoute.operationalState : null,
    );
    const timeline = activeRoute
      ? await this.prisma.operationalTimeline.findMany({
        where: { tenantId, routeId: activeRoute.id },
        orderBy: { createdAt: 'desc' },
        take: 300,
      })
      : [];

    const normalizedTrackingPoints = [...trackingPoints].reverse();

    client.emit('ops:state:replay', sanitizePayload({
      tenantId,
      driverId,
      route: activeRoute == null
        ? null
        : {
          ...activeRoute,
          operationalState: routeOperationalState,
        },
      latestPosition,
      trackingPoints: normalizedTrackingPoints,
      tracking_points: normalizedTrackingPoints,
      timeline: timeline.reverse(),
      replayedAt: new Date().toISOString(),
    }));
    this.logger.log(`[WEBSOCKET] [REPLAY] replay sent socketId=${client.id} tenantId=${tenantId} driverId=${driverId ?? '-'} routeId=${activeRoute?.id ?? '-'} vehicleId=${latestPosition?.vehicleId ?? '-'} points=${trackingPoints.length} timeline=${timeline.length}`);
  }

  private normalizeRealtimeOperationalState(state: string | null): string | null {
    if (!state) return null;
    if (state === 'PASSENGERS_ONBOARD') return 'BOARDED';
    return state === 'IN_PROGRESS' ? 'IN_TRANSIT' : state;
  }
}
