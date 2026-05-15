import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERVISOR')
@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('entity') entity?: string,
    @Query('userId') userId?: string,
    @Query('page') page?: string,
  ) {
    return this.service.findAll(req.user.tenantId, { entity, userId, page: page ? Number(page) : 1 });
  }
}
