import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { QueuesService } from './queues.service';

@Controller('queue')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Get()
  findAll() {
    return this.queuesService.findAll();
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

  @Post('ai-suggest')
  aiSuggest() {
    return this.queuesService.aiSuggest();
  }
}
