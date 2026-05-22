import { Body, Controller, Get, Logger, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TripsService } from './trips.service';

interface AuthRequest { user: { tenantId: string; userId: string; driverId?: string; role: string } }

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trips')
export class TripsController {
  private readonly logger = new Logger(TripsController.name);
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('routeId') routeId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.tripsService.findAll(req.user.tenantId, { routeId, status, page: page ? Number(page) : 1 });
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.tripsService.create(req.user.tenantId, sanitizePayload(body));
  }

  @Post(':id/board')
  @Roles('DRIVER')
  board(@Request() req: AuthRequest, @Param('id') id: string) {
    this.logger.log(`[TRIP] REST board request tenantId=${req.user.tenantId} tripId=${id}`);
    return this.tripsService.board(id, req.user.tenantId, {
      driverId: req.user.driverId,
      actorUserId: req.user.userId,
    });
  }

  @Post(':id/in-transit')
  inTransit(@Request() req: AuthRequest, @Param('id') id: string) {
    this.logger.log(`[TRIP] REST in-transit request tenantId=${req.user.tenantId} tripId=${id}`);
    return this.tripsService.inTransit(id, req.user.tenantId, {
      driverId: req.user.driverId,
      actorUserId: req.user.userId,
    });
  }

  @Post(':id/arrived')
  arrived(@Request() req: AuthRequest, @Param('id') id: string) {
    this.logger.log(`[TRIP] REST arrived request tenantId=${req.user.tenantId} tripId=${id}`);
    return this.tripsService.arrived(id, req.user.tenantId, {
      driverId: req.user.driverId,
      actorUserId: req.user.userId,
    });
  }

  @Post(':id/complete')
  complete(@Request() req: AuthRequest, @Param('id') id: string) {
    this.logger.log(`[TRIP] REST complete request tenantId=${req.user.tenantId} tripId=${id}`);
    return this.tripsService.complete(id, req.user.tenantId);
  }

  @Post(':id/no-show')
  noShow(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.tripsService.noShow(id, req.user.tenantId);
  }

  @Post(':id/cancel')
  cancel(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.tripsService.cancel(id, req.user.tenantId);
  }
}
