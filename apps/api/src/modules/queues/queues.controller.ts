import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { QueuesService } from './queues.service';

type ConfirmationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'UNREACHABLE' | 'WAITING_MANUAL_CONFIRMATION';
const VALID_CONFIRMATION_STATUSES: ConfirmationStatus[] = [
  'PENDING', 'CONFIRMED', 'CANCELED', 'UNREACHABLE', 'WAITING_MANUAL_CONFIRMATION',
];

const VALID_QUEUE_STATUSES = [
  'WAITING_DISPATCH', 'WAITING', 'CALLED', 'CONFIRMED', 'CHECKED_IN', 'BOARDING',
  'IN_TRANSIT', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'ASSIGNED', 'SCHEDULED',
  // aliases for dispatch-centric flow
  'PENDING_DISPATCH', 'SUGGESTED', 'DISPATCHED', 'IN_PROGRESS',
];

const STATUS_ALIAS: Record<string, string> = {
  PENDING_DISPATCH: 'WAITING_DISPATCH',
  SUGGESTED: 'ASSIGNED',
  DISPATCHED: 'ASSIGNED',
  IN_PROGRESS: 'IN_TRANSIT',
};

interface AuthRequest { user: { tenantId: string; role: string } }

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
    @Query('slaStatus') slaStatus?: string,
    @Query('confirmationStatus') confirmationStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.queuesService.findAll(req.user.tenantId, {
      queueType, priority, status, slaStatus, confirmationStatus,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('metrics')
  metrics(@Request() req: AuthRequest) {
    return this.queuesService.metrics(req.user.tenantId);
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.queuesService.findOne(id, req.user.tenantId);
  }

  /** @deprecated Prefer spreadsheet intake via POST /scheduling-import/upload */
  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.queuesService.create(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id/priority')
  updatePriority(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { priority: string }) {
    return this.queuesService.updatePriority(id, req.user.tenantId, body.priority);
  }

  @Put(':id/status')
  updateStatus(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { status: string; [key: string]: unknown }) {
    const { status, ...extra } = body;
    const normalizedStatus = STATUS_ALIAS[String(status).toUpperCase()] ?? status;
    const safeStatus = VALID_QUEUE_STATUSES.includes(normalizedStatus) ? normalizedStatus : 'WAITING_DISPATCH';
    const driverOnlyStatuses = ['IN_TRANSIT', 'ARRIVED'];
    if (driverOnlyStatuses.includes(safeStatus) && req.user.role !== 'DRIVER') {
      throw new ForbiddenException('Dispatch can only assign/schedule passengers; boarding and trip progress are driver-only');
    }
    return this.queuesService.updateStatus(id, req.user.tenantId, safeStatus, sanitizePayload(extra) as Record<string, unknown>);
  }

  @Post(':id/no-show')
  noShow(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.queuesService.markNoShow(id, req.user.tenantId, body.reason);
  }

  @Post(':id/sla/refresh')
  refreshSla(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.queuesService.refreshSla(id, req.user.tenantId);
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
