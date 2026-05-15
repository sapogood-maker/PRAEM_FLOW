import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { DailyOperationService } from './daily-operation.service';

@Controller('daily-operation')
export class DailyOperationController {
  constructor(private readonly service: DailyOperationService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.service.findAll(tenantId ?? '');
  }

  @Get('today')
  today(@Query('tenantId') tenantId: string) {
    return this.service.findToday(tenantId ?? '');
  }

  @Post('open')
  openToday(@Body() body: { tenantId: string }) {
    return this.service.openToday(sanitizePayload(body).tenantId ?? '');
  }

  @Put(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'PLANNING' | 'ACTIVE' | 'CLOSED' | 'CANCELLED' },
  ) {
    return this.service.updateStatus(id, sanitizePayload(body).status);
  }
}
