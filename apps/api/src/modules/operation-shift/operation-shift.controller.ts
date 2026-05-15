import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OperationShiftService } from './operation-shift.service';

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard)
@Controller('shifts')
export class OperationShiftController {
  constructor(private readonly service: OperationShiftService) {}

  @Get()
  findByOperation(@Request() req: AuthRequest, @Query('dailyOperationId') dailyOperationId: string) {
    return this.service.findByOperation(dailyOperationId ?? '', req.user.tenantId);
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    const data = sanitizePayload(body);
    return this.service.create(req.user.tenantId, data);
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
