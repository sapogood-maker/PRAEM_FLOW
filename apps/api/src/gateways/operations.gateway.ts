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
import { Server, Socket } from 'socket.io';
import { sanitizePayload } from '../common/sanitize';
import { PrismaService } from '../prisma/prisma.service';

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

  /** socket.id → { driverId, tenantId } for disconnect tracking */
  private driverSockets = new Map<string, { driverId: string; tenantId: string }>();

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    this.connectedClients.add(client.id);
  }

  async handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
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
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    if (typeof safe['tenantId'] === 'string') {
      client.join(`tenant:${safe['tenantId']}`);
    }
    return { ok: true };
  }

  @SubscribeMessage('leave:tenant')
  onLeaveTenant(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    if (typeof safe['tenantId'] === 'string') {
      client.leave(`tenant:${safe['tenantId']}`);
    }
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
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const tenantId = safe['tenantId'];
    const driverId = safe['driverId'];
    const deviceId = safe['deviceId'];
    if (typeof tenantId === 'string') client.join(`tenant:${tenantId}`);
    if (typeof driverId === 'string') client.join(`driver:${driverId}`);
    if (typeof deviceId === 'string') client.join(`device:${deviceId}`);

    // Record WS connection timestamp for operational status tracking
    if (typeof driverId === 'string' && typeof tenantId === 'string') {
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
    }

    return { ok: true };
  }

  /**
   * driver.heartbeat — sent by Flutter every 30 s to signal the tablet is alive.
   * Updates both wsLastSeenAt and lastHeartbeatAt on the Driver record and
   * emits driver.gps.active to the tenant room.
   */
  @SubscribeMessage('driver.heartbeat')
  async onDriverHeartbeat(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const tenantId = typeof safe['tenantId'] === 'string' ? safe['tenantId'] : null;
    const driverId = typeof safe['driverId'] === 'string' ? safe['driverId'] : null;

    if (tenantId) {
      this.server.to(`tenant:${tenantId}`).emit('driver.heartbeat', safe);
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

  /** driver.status_changed — motorista altera status (embarque, trânsito, etc.). */
  @SubscribeMessage('driver.status_changed')
  onDriverStatus(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('driver.status_changed', safe);
    return { ok: true };
  }

  // ─── Vehicle domain ───────────────────────────────────────────────────────

  @SubscribeMessage('vehicle.location_updated')
  onVehicleLocation(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('vehicle.location_updated', safe);
    return { ok: true };
  }

  @SubscribeMessage('vehicle.status_changed')
  onVehicleStatus(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('vehicle.status_changed', safe);
    return { ok: true };
  }

  @SubscribeMessage('vehicle.heartbeat')
  onVehicleHeartbeat(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('vehicle.heartbeat', safe);
    return { ok: true };
  }

  @SubscribeMessage('vehicle.online')
  onVehicleOnline(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('vehicle.online', safe);
    return { ok: true };
  }

  @SubscribeMessage('vehicle.offline')
  onVehicleOffline(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('vehicle.offline', safe);
    return { ok: true };
  }

  @SubscribeMessage('vehicle.idle')
  onVehicleIdle(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('vehicle.idle', safe);
    return { ok: true };
  }

  // ─── Patient domain ───────────────────────────────────────────────────────

  @SubscribeMessage('patient.checked_in')
  onPatientCheckedIn(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('patient.checked_in', safe);
    return { ok: true };
  }

  @SubscribeMessage('patient.boarded')
  onPatientBoarded(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('patient.boarded', safe);
    return { ok: true };
  }

  @SubscribeMessage('patient.arrived')
  onPatientArrived(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('patient.arrived', safe);
    return { ok: true };
  }

  @SubscribeMessage('patient.missed')
  onPatientMissed(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('patient.missed', safe);
    return { ok: true };
  }

  // ─── Queue domain ─────────────────────────────────────────────────────────

  @SubscribeMessage('queue.priority_changed')
  onQueuePriorityChanged(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('queue.priority_changed', safe);
    return { ok: true };
  }

  @SubscribeMessage('queue.updated')
  onQueueUpdated(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('queue.updated', safe);
    return { ok: true };
  }

  // ─── Trip domain ──────────────────────────────────────────────────────────

  @SubscribeMessage('trip.status_changed')
  onTripStatus(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('trip.status_changed', safe);
    return { ok: true };
  }

  @SubscribeMessage('trip.started')
  onTripStarted(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('trip.started', safe);
    return { ok: true };
  }

  @SubscribeMessage('trip.completed')
  onTripCompleted(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('trip.completed', safe);
    return { ok: true };
  }

  // ─── Route domain ─────────────────────────────────────────────────────────

  @SubscribeMessage('route.optimized')
  onRouteOptimized(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('route.optimized', safe);
    return { ok: true };
  }

  @SubscribeMessage('route.status_changed')
  onRouteStatus(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('route.status_changed', safe);
    return { ok: true };
  }

  // ─── QR domain ───────────────────────────────────────────────────────────

  @SubscribeMessage('qr.invalid_detected')
  onQrInvalid(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('qr.invalid_detected', safe);
    return { ok: true };
  }

  // ─── Server-side emit helpers ─────────────────────────────────────────────

  emitToTenant(tenantId: string, event: string, payload: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).emit(event, sanitizePayload(payload));
  }

  emitAlert(tenantId: string, alert: { type: string; message: string; severity: string; data?: unknown }) {
    this.server.to(`tenant:${tenantId}`).emit('operational.alert', sanitizePayload(alert));
  }
}
