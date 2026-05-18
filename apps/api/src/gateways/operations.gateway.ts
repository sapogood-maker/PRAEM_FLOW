import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { sanitizePayload } from '../common/sanitize';

/**
 * OperationsGateway — dedicated /operations namespace.
 * All operational domain events are isolated here.
 * Domain prefixes: vehicle.* | patient.* | queue.* | trip.* | route.* | driver.* | qr.*
 */
@WebSocketGateway({ namespace: '/operations', cors: { origin: '*' } })
export class OperationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private connectedClients = new Set<string>();

  handleConnection(client: Socket) {
    this.connectedClients.add(client.id);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
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
   */
  @SubscribeMessage('join:driver')
  onJoinDriver(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const tenantId = safe['tenantId'];
    const driverId = safe['driverId'];
    const deviceId = safe['deviceId'];
    if (typeof tenantId === 'string') client.join(`tenant:${tenantId}`);
    if (typeof driverId === 'string') client.join(`driver:${driverId}`);
    if (typeof deviceId === 'string') client.join(`device:${deviceId}`);
    return { ok: true };
  }

  /** driver.heartbeat — sent by Flutter every 30 s to signal the tablet is alive. */
  @SubscribeMessage('driver.heartbeat')
  onDriverHeartbeat(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : null;
    if (room) this.server.to(room).emit('driver.heartbeat', safe);
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
