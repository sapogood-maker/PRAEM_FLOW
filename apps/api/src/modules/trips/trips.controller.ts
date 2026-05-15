import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TripsService } from './trips.service';

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripsController {
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
  board(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.tripsService.board(id, req.user.tenantId);
  }

  @Post(':id/complete')
  complete(@Request() req: AuthRequest, @Param('id') id: string) {
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
