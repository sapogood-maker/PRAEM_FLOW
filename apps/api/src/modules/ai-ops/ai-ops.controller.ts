import { Body, Controller, Get, Post } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { AiOpsService } from './ai-ops.service';

@Controller('ai-ops')
export class AiOpsController {
  constructor(private readonly service: AiOpsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post('route-optimization')
  routeOptimization(@Body() body: { routeIds: string[] }) {
    return this.service.suggestRouteOptimization(sanitizePayload(body).routeIds ?? []);
  }

  @Post('predict-absences')
  predictAbsences(@Body() body: { queueIds: string[] }) {
    return this.service.predictAbsences(sanitizePayload(body).queueIds ?? []);
  }

  @Post('detect-empty-trips')
  detectEmptyTrips(@Body() body: { tripIds: string[] }) {
    return this.service.detectEmptyTrips(sanitizePayload(body).tripIds ?? []);
  }
}
