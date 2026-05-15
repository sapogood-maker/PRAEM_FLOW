import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { TrackingService, VehicleTrackingPayload } from './tracking.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('update')
  update(@Body() body: VehicleTrackingPayload) {
    this.trackingService.update(sanitizePayload(body));
    return { updated: true };
  }

  @Get('vehicles')
  vehicles() {
    return this.trackingService.vehicles();
  }

  @Get('vehicles/:id')
  vehicleById(@Param('id') id: string) {
    return this.trackingService.vehicleById(id);
  }
}
