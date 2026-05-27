import { Body, Controller, Delete, Get, Logger, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoutesService } from './routes.service';

interface AuthRequest { user: { tenantId: string; userId: string; driverId?: string; role: string } }

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('routes')
export class RoutesController {
  private readonly logger = new Logger(RoutesController.name);
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('page') page?: string,
  ) {
    return this.routesService.findAll(req.user.tenantId, { status, date, startDate, endDate, driverId, vehicleId, page: page ? Number(page) : 1 });
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.routesService.findOne(id, req.user.tenantId);
  }

  @Get(':id/diagnostics/trips')
  diagnostics(@Request() req: AuthRequest, @Param('id') id: string) {
    this.logger.log(`[ROUTE] diagnostics request tenantId=${req.user.tenantId} routeId=${id}`);
    return this.routesService.diagnostics(id, req.user.tenantId);
  }

  /** @deprecated Prefer spreadsheet intake via POST /scheduling-import/upload */
  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.routesService.create(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    return this.routesService.update(id, req.user.tenantId, sanitizePayload(body));
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.routesService.remove(id, req.user.tenantId);
  }

  @Post(':id/optimize')
  optimize(@Param('id') id: string) {
    return this.routesService.optimize(id);
  }

  @Post(':id/start')
  @Roles('DRIVER')
  startRoute(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { tripId?: string; source?: string }) {
    this.logger.log(`[ROUTE] REST start request tenantId=${req.user.tenantId} routeId=${id} tripId=${body?.tripId ?? '-'} source=${body?.source ?? '-'}`);
    return this.routesService.startRoute(id, req.user.tenantId, sanitizePayload(body), {
      driverId: req.user.driverId,
      actorUserId: req.user.userId,
    });
  }

  @Post(':id/complete')
  @Roles('DRIVER')
  completeRoute(@Request() req: AuthRequest, @Param('id') id: string) {
    this.logger.log(`[ROUTE] REST complete request tenantId=${req.user.tenantId} routeId=${id} driverId=${req.user.driverId}`);
    return this.routesService.completeRoute(id, req.user.tenantId, {
      driverId: req.user.driverId,
      actorUserId: req.user.userId,
    });
  }

  @Post(':id/force-complete')
  @Roles('DRIVER', 'SUPERVISOR', 'ADMIN', 'COORDINATOR')
  forceCompleteRoute(@Request() req: AuthRequest, @Param('id') id: string) {
    this.logger.log(`[RECOVERY] [FINALIZE] REST force-complete request tenantId=${req.user.tenantId} routeId=${id} driverId=${req.user.driverId ?? '-'} role=${req.user.role}`);
    return this.routesService.forceCompleteRoute(id, req.user.tenantId, {
      driverId: req.user.driverId,
      actorUserId: req.user.userId,
    });
  }

  @Post('recovery/stale')
  @Roles('SUPERVISOR', 'ADMIN', 'COORDINATOR')
  recoverStaleRoutes(@Request() req: AuthRequest, @Body() body: { cutoffHours?: number }) {
    this.logger.log(`[RECOVERY] [STALE_ROUTE] REST recovery stale tenantId=${req.user.tenantId} cutoffHours=${body?.cutoffHours ?? 12}`);
    return this.routesService.recoverStaleRoutes(req.user.tenantId, body?.cutoffHours, {
      actorUserId: req.user.userId,
    });
  }
}
