import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DriversService } from './drivers.service';

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard)
@Controller('drivers')
export class DriversController {
  constructor(private readonly service: DriversService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
  ) {
    return this.service.findAll(req.user.tenantId, { search, status, page: page ? Number(page) : 1 });
  }

  @Get('online')
  getOnline(@Request() req: AuthRequest) {
    return this.service.getOnlineDrivers(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(id, req.user.tenantId);
  }

  /** Create driver + user in one call (admin dashboard use). */
  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.service.createWithUser(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    return this.service.update(id, req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id/reset-password')
  resetPassword(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { password: string }) {
    return this.service.resetPassword(id, req.user.tenantId, body.password);
  }

  @Put(':id/active')
  setActive(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { active: boolean }) {
    return this.service.setActive(id, req.user.tenantId, body.active);
  }
}

