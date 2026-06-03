import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { sanitizePayload } from '../../common/sanitize';
import { SyncService } from './sync.service';

interface AuthRequest { user: { tenantId: string; userId: string; driverId?: string; role: string } }

@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Post('offline-events')
  sync(@Request() req: AuthRequest, @Body() body: { deviceId: string; events: any[] }) {
    return this.service.syncOfflineEvents(req.user.tenantId, sanitizePayload(body), req.user);
  }
}
