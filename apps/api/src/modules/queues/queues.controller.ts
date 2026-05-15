import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { QueuesService } from './queues.service';

type ConfirmationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'UNREACHABLE' | 'WAITING_MANUAL_CONFIRMATION';

const VALID_CONFIRMATION_STATUSES: ConfirmationStatus[] = [
  'PENDING', 'CONFIRMED', 'CANCELED', 'UNREACHABLE', 'WAITING_MANUAL_CONFIRMATION',
];

@Controller('queue')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Get()
  findAll(@Query('type') type?: string) {
    return this.queuesService.findAll(type);
  }

  @Post()
  create(@Body() body: any) {
    const created = this.queuesService.create(sanitizePayload(body));
    return { created: true, id: created.id };
  }

  @Put(':id/priority')
  updatePriority(@Param('id') id: string, @Body() body: { priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'PENDING' }) {
    return this.queuesService.updatePriority(id, body.priority);
  }

  @Put(':id/confirmation')
  updateConfirmation(@Param('id') id: string, @Body() body: { status: string; channel?: string }) {
    const status = VALID_CONFIRMATION_STATUSES.includes(body.status as ConfirmationStatus)
      ? (body.status as ConfirmationStatus)
      : 'PENDING';
    return this.queuesService.updateConfirmation(id, status, body.channel);
  }

  @Post('ai-suggest')
  aiSuggest() {
    return this.queuesService.aiSuggest();
  }
}
