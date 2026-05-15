import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('vehicle:position')
  onVehiclePosition(@MessageBody() payload: unknown) {
    this.server.emit('vehicle:position', payload);
    return { ok: true };
  }

  @SubscribeMessage('trip:status')
  onTripStatus(@MessageBody() payload: unknown) {
    this.server.emit('trip:status', payload);
    return { ok: true };
  }

  @SubscribeMessage('queue:update')
  onQueueUpdate(@MessageBody() payload: unknown) {
    this.server.emit('queue:update', payload);
    return { ok: true };
  }

  @SubscribeMessage('route:status')
  onRouteStatus(@MessageBody() payload: unknown) {
    this.server.emit('route:status', payload);
    return { ok: true };
  }

  emitDashboardKpis(payload: unknown) {
    this.server.emit('dashboard:kpis', payload);
  }
}
