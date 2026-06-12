import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WhatsappService } from './whatsapp.service';
import { WhatsappTemplateService } from './whatsapp-template.service';
import { WhatsappQueueService } from './whatsapp-queue.service';

interface AuthRequest {
  user: { tenantId: string; userId: string; role: string; driverId?: string };
}

// ─── Notification Endpoints (operational triggers) ─────────────────────────

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly whatsapp: WhatsappService) {}

  /** POST /notifications/appointment-confirmation */
  @Post('appointment-confirmation')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  async appointmentConfirmation(
    @Request() req: AuthRequest,
    @Body() body: { patientId: string; tripId: string; date: string; time: string },
  ) {
    return this.whatsapp.notifyAppointmentConfirmed(req.user.tenantId, body.patientId, body.tripId, {
      date: body.date,
      time: body.time,
    });
  }

  /** POST /notifications/driver-arriving */
  @Post('driver-arriving')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'DRIVER')
  async driverArriving(
    @Request() req: AuthRequest,
    @Body() body: { patientId: string; tripId: string; routeId: string; driver_name: string; vehicle: string },
  ) {
    return this.whatsapp.notifyDriverArriving(req.user.tenantId, body.patientId, body.tripId, body.routeId, {
      driver_name: body.driver_name,
      vehicle: body.vehicle,
    });
  }

  /** POST /notifications/no-show */
  @Post('no-show')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'DRIVER')
  async noShow(
    @Request() req: AuthRequest,
    @Body() body: { patientId: string; tripId: string },
  ) {
    return this.whatsapp.notifyNoShow(req.user.tenantId, body.patientId, body.tripId);
  }

  /** POST /notifications/send-route */
  @Post('send-route')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'DRIVER')
  async sendRoute(
    @Request() req: AuthRequest,
    @Body() body: { patientId: string; tripId: string; routeId: string },
  ) {
    return this.whatsapp.notifyRouteStarted(req.user.tenantId, body.patientId, body.tripId, body.routeId);
  }

  /** POST /notifications/send-boarding-qr */
  @Post('send-boarding-qr')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'DRIVER')
  async sendBoardingQr(
    @Request() req: AuthRequest,
    @Body() body: { tripId: string },
  ) {
    return this.whatsapp.sendBoardingQr(req.user.tenantId, body.tripId);
  }
}

// ─── Boarding QR Validation (public-ish — requires JWT) ─────────────────────

@UseGuards(JwtAuthGuard)
@Controller('boarding')
export class BoardingController {
  constructor(private readonly whatsapp: WhatsappService) {}

  /**
   * POST /boarding/validate-qr
   * Validates a scanned QR token (patient qrToken or TripToken BOARDING).
   * Used by Flutter driver app QR scanner.
   */
  @Post('validate-qr')
  validateQr(
    @Body() body: {
      token: string;
      vehicleId?: string;
      routeId?: string;
      deviceId?: string;
      source?: string;
    },
  ) {
    return this.whatsapp.validateBoardingQr(body.token, {
      vehicleId: body.vehicleId,
      routeId: body.routeId,
      deviceId: body.deviceId,
      source: body.source,
    });
  }
}

// ─── Admin Template Management ───────────────────────────────────────────────

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('whatsapp/templates')
export class WhatsappTemplatesController {
  constructor(private readonly templateService: WhatsappTemplateService) {}

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  findAll(@Request() req: AuthRequest) {
    return this.templateService.findAll(req.user.tenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.templateService.findOne(id, req.user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  create(
    @Request() req: AuthRequest,
    @Body() body: { key: string; title: string; message: string; variables?: string[] },
  ) {
    return this.templateService.create(req.user.tenantId, body);
  }

  @Put(':id')
  @Roles('ADMIN', 'OPERATOR')
  update(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { title?: string; message?: string; variables?: string[]; active?: boolean },
  ) {
    return this.templateService.update(id, req.user.tenantId, body);
  }

  @Put(':id/active')
  @Roles('ADMIN', 'OPERATOR')
  setActive(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    return this.templateService.setActive(id, req.user.tenantId, body.active);
  }

  @Post('seed-defaults')
  @Roles('ADMIN')
  seedDefaults(@Request() req: AuthRequest) {
    return this.templateService.seedDefaults(req.user.tenantId);
  }
}

// ─── Admin Queue / Logs ──────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('whatsapp')
export class WhatsappAdminController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly queue: WhatsappQueueService,
  ) {}

  @Get('queue/stats')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  stats(@Request() req: AuthRequest) {
    return this.queue.getStats(req.user.tenantId);
  }

  @Get('logs')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  logs(
    @Request() req: AuthRequest,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.queue.getLogs(req.user.tenantId, {
      status,
      limit: limit ? Number(limit) : 50,
      page: page ? Number(page) : 1,
    });
  }

  @Post('retry/:logId')
  @Roles('ADMIN', 'OPERATOR')
  retry(@Request() req: AuthRequest, @Param('logId') logId: string) {
    return this.whatsapp.manualRetry(logId, req.user.tenantId);
  }

  /** Test send — sends a text directly to a phone number */
  @Post('test-send')
  @Roles('ADMIN')
  testSend(
    @Request() req: AuthRequest,
    @Body() body: { phone: string; message: string },
  ) {
    return this.whatsapp.sendText(req.user.tenantId, body.phone, body.message);
  }
}
