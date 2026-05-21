import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TripStopsService } from './trip-stops.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class TripStopsController {
  constructor(private readonly service: TripStopsService) {}

  /** GET /trips/:tripId/stops — list all stops for a trip */
  @Get('trips/:tripId/stops')
  findAll(@Param('tripId') tripId: string, @Request() req: any) {
    return this.service.findByTrip(req.user.tenantId, tripId);
  }

  /** GET /trips/:tripId/stops/current — current + next stop */
  @Get('trips/:tripId/stops/current')
  getCurrent(@Param('tripId') tripId: string, @Request() req: any) {
    return this.service.findCurrentStop(req.user.tenantId, tripId);
  }

  /** POST /trips/:tripId/stops — add a new stop */
  @Post('trips/:tripId/stops')
  create(
    @Param('tripId') tripId: string,
    @Body()
    body: {
      sequence: number;
      type: string;
      name: string;
      locationId?: string;
      lat?: number;
      lng?: number;
      plannedArrival?: string;
      notes?: string;
    },
    @Request() req: any,
  ) {
    return this.service.create(req.user.tenantId, tripId, body);
  }

  /** PATCH /trip-stops/:id/arrive — driver confirms arrival */
  @Patch('trip-stops/:id/arrive')
  @HttpCode(HttpStatus.OK)
  arrive(@Param('id') id: string, @Request() req: any) {
    return this.service.updateStatus(req.user.tenantId, id, 'ARRIVED');
  }

  /** PATCH /trip-stops/:id/en-route — driver is heading to stop */
  @Patch('trip-stops/:id/en-route')
  @HttpCode(HttpStatus.OK)
  enRoute(@Param('id') id: string, @Request() req: any) {
    return this.service.updateStatus(req.user.tenantId, id, 'EN_ROUTE');
  }

  /** PATCH /trip-stops/:id/boarding — start boarding patients at stop */
  @Patch('trip-stops/:id/boarding')
  @HttpCode(HttpStatus.OK)
  boarding(@Param('id') id: string, @Request() req: any) {
    return this.service.updateStatus(req.user.tenantId, id, 'BOARDING');
  }

  /** PATCH /trip-stops/:id/complete — mark stop as completed */
  @Patch('trip-stops/:id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Param('id') id: string, @Request() req: any) {
    return this.service.updateStatus(req.user.tenantId, id, 'COMPLETED');
  }

  /** PATCH /trip-stops/:id/skip — skip this stop */
  @Patch('trip-stops/:id/skip')
  @HttpCode(HttpStatus.OK)
  skip(@Param('id') id: string, @Request() req: any) {
    return this.service.updateStatus(req.user.tenantId, id, 'SKIPPED');
  }

  /** DELETE /trip-stops/:id */
  @Delete('trip-stops/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(req.user.tenantId, id);
  }
}
