import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VehiclesService } from './vehicles.service';

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
  ) {
    return this.service.findAll(req.user.tenantId, { search, status, type, page: page ? Number(page) : 1 });
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(id, req.user.tenantId);
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.service.create(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    return this.service.update(id, req.user.tenantId, sanitizePayload(body));
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.remove(id, req.user.tenantId);
  }
}

