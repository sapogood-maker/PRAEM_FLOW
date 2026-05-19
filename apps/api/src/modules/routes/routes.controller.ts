import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RoutesService } from './routes.service';

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('status') status?: string,
    @Query('date') date?: string,
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
    @Query('page') page?: string,
  ) {
    return this.routesService.findAll(req.user.tenantId, { status, date, driverId, vehicleId, page: page ? Number(page) : 1 });
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.routesService.findOne(id, req.user.tenantId);
  }

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
  startRoute(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.routesService.startRoute(id, req.user.tenantId);
  }

  @Post(':id/complete')
  completeRoute(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.routesService.completeRoute(id, req.user.tenantId);
  }
}

