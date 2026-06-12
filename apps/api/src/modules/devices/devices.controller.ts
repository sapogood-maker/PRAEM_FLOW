import { Body, Controller, Delete, Get, Ip, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DevicesService } from './devices.service';

interface AuthRequest {
  user: { tenantId: string; userId: string };
}

@UseGuards(JwtAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('type') type?: string,
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.devicesService.findAll(req.user.tenantId, {
      type,
      active: active !== undefined ? active === 'true' : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.devicesService.findOne(id, req.user.tenantId);
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.devicesService.create(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    return this.devicesService.update(id, req.user.tenantId, sanitizePayload(body));
  }

  @Post(':id/heartbeat')
  heartbeat(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Ip() ip: string,
    @Body('appVersion') appVersion?: string,
  ) {
    return this.devicesService.heartbeat(id, req.user.tenantId, ip, appVersion);
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.devicesService.remove(id, req.user.tenantId);
  }
}
