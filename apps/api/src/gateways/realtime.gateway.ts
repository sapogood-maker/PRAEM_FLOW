import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { sanitizePayload } from '../common/sanitize';

@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  // Vehicle sends GPS position — broadcast to tenant room
  @SubscribeMessage('vehicle:tracking')
  onVehicleTracking(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : 'global';
    client.to(room).emit('vehicle:tracking', safe);
    return { ok: true };
  }

  // Legacy vehicle:position kept for compatibility
  @SubscribeMessage('vehicle:position')
  onVehiclePosition(@MessageBody() payload: unknown) {
    this.server.emit('vehicle:position', sanitizePayload(payload));
    return { ok: true };
  }

  @SubscribeMessage('trip:status')
  onTripStatus(@MessageBody() payload: unknown) {
    this.server.emit('trip:status', sanitizePayload(payload));
    return { ok: true };
  }

  @SubscribeMessage('queue:update')
  onQueueUpdate(@MessageBody() payload: unknown) {
    this.server.emit('queue:update', sanitizePayload(payload));
    return { ok: true };
  }

  @SubscribeMessage('route:status')
  onRouteStatus(@MessageBody() payload: unknown) {
    this.server.emit('route:status', sanitizePayload(payload));
    return { ok: true };
  }

  @SubscribeMessage('join:tenant')
  onJoinTenant(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    if (typeof safe['tenantId'] === 'string') {
      client.join(`tenant:${safe['tenantId']}`);
    }
    return { ok: true };
  }

  // ─── Operational events (patient boarding / dispatch) ────────────────────

  /** Patient checked in at pickup point */
  @SubscribeMessage('patient:checked_in')
  onPatientCheckedIn(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : 'global';
    this.server.to(room).emit('patient:checked_in', safe);
    return { ok: true };
  }

  /** Patient boarded the vehicle */
  @SubscribeMessage('patient:boarded')
  onPatientBoarded(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : 'global';
    this.server.to(room).emit('patient:boarded', safe);
    return { ok: true };
  }

  /** Patient arrived at destination */
  @SubscribeMessage('patient:arrived')
  onPatientArrived(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : 'global';
    this.server.to(room).emit('patient:arrived', safe);
    return { ok: true };
  }

  /** Vehicle GPS updated */
  @SubscribeMessage('vehicle:location_updated')
  onVehicleLocationUpdated(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : 'global';
    client.to(room).emit('vehicle:location_updated', safe);
    return { ok: true };
  }

  /** Route optimization completed */
  @SubscribeMessage('route:optimized')
  onRouteOptimized(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : 'global';
    this.server.to(room).emit('route:optimized', safe);
    return { ok: true };
  }

  /** Queue priority changed */
  @SubscribeMessage('queue:priority_changed')
  onQueuePriorityChanged(@MessageBody() payload: unknown, @ConnectedSocket() client: Socket) {
    const safe = sanitizePayload(payload) as Record<string, unknown>;
    const room = typeof safe['tenantId'] === 'string' ? `tenant:${safe['tenantId']}` : 'global';
    this.server.to(room).emit('queue:priority_changed', safe);
    return { ok: true };
  }

  // ─── Server-side emit helpers ─────────────────────────────────────────────

  emitDashboardKpis(payload: unknown) {
    this.server.emit('dashboard:kpis', sanitizePayload(payload));
  }

  emitToTenant(tenantId: string, event: string, payload: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, sanitizePayload(payload));
  }

  /** Emit directly to a driver's tablet using driver:{driverId} room */
  emitToDriver(driverId: string, event: string, payload: unknown) {
    this.server.to(`driver:${driverId}`).emit(event, sanitizePayload(payload));
  }

  /** Emit an operational event scoped to a specific tenant */
  emitOperational(tenantId: string, event: string, payload: Record<string, unknown>) {
    this.server.to(`tenant:${tenantId}`).emit(event, sanitizePayload(payload));
  }
}
