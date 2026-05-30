import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { HealthcareLocationsService } from './healthcare-locations.service';

interface AuthRequest {
  user: { tenantId: string };
}

@UseGuards(JwtAuthGuard)
@Controller('healthcare-locations')
export class HealthcareLocationsController {
  constructor(private readonly service: HealthcareLocationsService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('specialty') specialty?: string,
    @Query('active') active?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(req.user.tenantId, {
      search,
      type,
      specialty,
      active,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('by-specialty/:specialty')
  findBySpecialty(@Request() req: AuthRequest, @Param('specialty') specialty: string) {
    return this.service.findBySpecialty(req.user.tenantId, specialty);
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
