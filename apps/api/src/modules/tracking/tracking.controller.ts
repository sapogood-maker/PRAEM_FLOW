import { Body, Controller, Get, Post } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { TrackingService } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('update')
  update(@Body() body: { vehicleId: string; driverId: string; tenantId: string; lat: number; lng: number }) {
    this.trackingService.update(sanitizePayload(body));
    return { updated: true };
  }

  @Get('vehicles')
  vehicles() {
    return this.trackingService.vehicles();
  }
}
