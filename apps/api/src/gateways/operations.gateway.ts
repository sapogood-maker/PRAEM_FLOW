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
      client.disconnect(true);
      return;
    }
    this.socketUsers.set(client.id, authUser);
    this.connectedClients.add(client.id);
    client.join(`tenant:${authUser.tenantId}`);
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
        this.logger.log(`[DRIVER OFFLINE] driverId=${info.driverId} tenantId=${info.tenantId}`);
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
    const driverId = typeof safe['driverId'] === 'string'
      ? safe['driverId']
      : (user.driverId ?? null);
    const deviceId = safe['deviceId'];
    if (user.role === 'DRIVER' && user.driverId && driverId !== user.driverId) {
      return { ok: false, error: 'forbidden' };
    }

    client.join(`tenant:${tenantId}`);
    if (typeof driverId === 'string') client.join(`driver:${driverId}`);
    if (typeof deviceId === 'string') client.join(`device:${deviceId}`);

    // Record WS connection timestamp for operational status tracking
    if (typeof driverId === 'string') {
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
      return { ok: false, error: 'forbidden' };
    }
    await this.emitStateReplay(client, user.tenantId, requestedDriverId);
    return { ok: true };
  }

  @SubscribeMessage('ops:ping')
  onOpsPing(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
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
  onDriverLocationUpdate(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const user = this.getSocketUser(client);
    if (!user) return { ok: false, error: 'unauthorized' };
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    if (!this.canEmitDriverEvent(user, safe)) return { ok: false, error: 'forbidden' };
    const room = `tenant:${user.tenantId}`;
    if (room) {
      this.server.to(room).emit('driver:location:update', safe);
      this.server.to(room).emit('vehicle.location_updated', safe);
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
    this.server.to(`tenant:${tenantId}`).emit(event, sanitizePayload(payload));
  }

  emitToDriver(driverId: string, event: string, payload: Record<string, unknown>) {
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
      if (!user.driverId || !payloadDriverId) return false;
      return payloadDriverId === user.driverId;
    }
    return true;
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
          orderBy: { createdAt: 'asc' },
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

    client.emit('ops:state:replay', sanitizePayload({
      tenantId,
      driverId,
      route: activeRoute,
      latestPosition,
      replayedAt: new Date().toISOString(),
    }));
  }
}
