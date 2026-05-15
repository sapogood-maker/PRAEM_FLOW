import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { QueuesService } from './queues.service';

type ConfirmationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'UNREACHABLE' | 'WAITING_MANUAL_CONFIRMATION';
const VALID_CONFIRMATION_STATUSES: ConfirmationStatus[] = [
  'PENDING', 'CONFIRMED', 'CANCELED', 'UNREACHABLE', 'WAITING_MANUAL_CONFIRMATION',
];

interface AuthRequest { user: { tenantId: string } }

@UseGuards(JwtAuthGuard)
@Controller('queue')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('type') queueType?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
    @Query('confirmationStatus') confirmationStatus?: string,
    @Query('page') page?: string,
  ) {
    return this.queuesService.findAll(req.user.tenantId, { queueType, priority, status, confirmationStatus, page: page ? Number(page) : 1 });
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.queuesService.create(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id/priority')
  updatePriority(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { priority: string }) {
    return this.queuesService.updatePriority(id, req.user.tenantId, body.priority);
  }

  @Put(':id/confirmation')
  updateConfirmation(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { status: string; channel?: string }) {
    const status = VALID_CONFIRMATION_STATUSES.includes(body.status as ConfirmationStatus)
      ? (body.status as ConfirmationStatus)
      : 'PENDING';
    return this.queuesService.updateConfirmation(id, req.user.tenantId, status, body.channel);
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.queuesService.remove(id, req.user.tenantId);
  }

  @Post('ai-suggest')
  aiSuggest(@Request() req: AuthRequest) {
    return this.queuesService.aiSuggest(req.user.tenantId);
  }
}
