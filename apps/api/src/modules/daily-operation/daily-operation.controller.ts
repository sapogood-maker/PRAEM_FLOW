import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DailyOperationService } from './daily-operation.service';

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard)
@Controller('daily-operations')
export class DailyOperationController {
  constructor(private readonly service: DailyOperationService) {}

  @Get()
  findAll(@Request() req: AuthRequest) {
    return this.service.findAll(req.user.tenantId);
  }

  @Get('today')
  today(@Request() req: AuthRequest) {
    return this.service.findToday(req.user.tenantId);
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.service.create(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id/status')
  updateStatus(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.service.updateStatus(id, req.user.tenantId, sanitizePayload(body).status);
  }
}
