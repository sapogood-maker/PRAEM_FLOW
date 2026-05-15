import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService } from './users.service';

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
  ) {
    return this.service.findAll(req.user.tenantId, { search, role, page: page ? Number(page) : 1 });
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(id, req.user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'SUPERVISOR')
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.service.create(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id')
  @Roles('ADMIN', 'SUPERVISOR')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    return this.service.update(id, req.user.tenantId, sanitizePayload(body));
  }
}
