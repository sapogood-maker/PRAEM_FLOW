import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { OperationShiftService } from './operation-shift.service';

@Controller('operation-shift')
export class OperationShiftController {
  constructor(private readonly service: OperationShiftService) {}

  @Get()
  findByOperation(@Query('dailyOperationId') dailyOperationId: string) {
    return this.service.findByOperation(dailyOperationId ?? '');
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(sanitizePayload(body));
  }

  @Put(':id/activate')
  activate(@Param('id') id: string) {
    return this.service.activate(id);
  }

  @Put(':id/complete')
  complete(@Param('id') id: string) {
    return this.service.complete(id);
  }
}
