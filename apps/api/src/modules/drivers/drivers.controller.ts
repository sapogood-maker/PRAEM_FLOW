import { Body, Controller, Get, Param, Put, Query, Request, UseGuards } from '@nestjs/common';
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

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(id, req.user.tenantId);
  }

  @Put(':id')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    return this.service.update(id, req.user.tenantId, sanitizePayload(body));
  }
}

