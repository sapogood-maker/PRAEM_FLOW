import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ZApiAdapter } from './zapi.adapter';
import { WhatsappTemplateService } from './whatsapp-template.service';
import { WhatsappQueueService } from './whatsapp-queue.service';
import { SendMessageOptions, NotificationTemplateKey } from './whatsapp.types';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as QRCode from 'qrcode';

/** Window within which duplicate sends are suppressed (milliseconds) */
const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_RETRIES = 3;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: ZApiAdapter,
    private readonly templates: WhatsappTemplateService,
    private readonly queue: WhatsappQueueService,
  ) {
    // Register the retry handler with the queue service
    this.queue.registerSendHandler((logId) => this.retrySend(logId));
  }

  // ─── Core Send ─────────────────────────────────────────────────────────────

  /**
   * Primary send entry point. Renders the template, checks dedup,
   * persists the log, sends immediately, and updates status.
   */
  async sendFromTemplate(options: SendMessageOptions): Promise<{ logId: string; status: string }> {
    const { tenantId, patientId, tripId, routeId, phone, templateKey, variables = {} } = options;

    this.logger.log(
      `[WHATSAPP] sendFromTemplate key=${templateKey} patientId=${patientId ?? '-'} tripId=${tripId ?? '-'}`,
    );

    // Render template
    const { message, templateId } = await this.templates.renderMessage(tenantId, templateKey, variables);

    // Deduplication check
    const isDuplicate = await this.checkDuplicate(tenantId, phone, templateKey);
    if (isDuplicate) {
      this.logger.warn(`[WHATSAPP] DUPLICATE suppressed key=${templateKey} phone=${phone}`);
      const log = await this.prisma.notificationLog.create({
        data: { tenantId, templateId, patientId, tripId, routeId, phone, message, status: 'DUPLICATE', maxRetries: MAX_RETRIES },
      });
      return { logId: log.id, status: 'DUPLICATE' };
    }

    // Persist with PENDING status
    const log = await this.prisma.notificationLog.create({
      data: { tenantId, templateId, patientId, tripId, routeId, phone, message, status: 'PENDING', maxRetries: MAX_RETRIES },
    });

    // Attempt immediate send
    return this.doSend(log.id, phone, message);
  }

  /** Sends a plain text message without a template */
  async sendText(tenantId: string, phone: string, message: string, meta?: { patientId?: string; tripId?: string; routeId?: string }) {
    const log = await this.prisma.notificationLog.create({
      data: {
        tenantId,
        phone,
        message,
        status: 'PENDING',
        maxRetries: MAX_RETRIES,
        patientId: meta?.patientId,
        tripId: meta?.tripId,
        routeId: meta?.routeId,
      },
    });
    return this.doSend(log.id, phone, message);
  }

  /** Sends patient boarding QR via WhatsApp using their existing qrToken */
  async sendBoardingQr(tenantId: string, tripId: string): Promise<{ logId: string; status: string }> {
    this.logger.log(`[QR] sendBoardingQr tripId=${tripId}`);

    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, tenantId },
      include: {
        patient: { select: { id: true, name: true, phone: true, qrToken: true, qrActive: true, qrExpiresAt: true } },
        route: { select: { date: true, destination: true } },
      },
    });

    if (!trip) throw new Error(`Trip not found: ${tripId}`);

    const { patient } = trip;
    if (!patient?.phone) {
      this.logger.warn(`[QR] Patient ${patient?.id} has no phone — skipping QR send`);
      return { logId: 'skipped', status: 'SKIPPED' };
    }

    // Use patient qrToken (same token used in physical print and Flutter scanner)
    const qrContent = patient.qrToken ?? trip.id;
    const qrDataUrl = await QRCode.toDataURL(qrContent, { type: 'image/png', width: 512, margin: 2 });

    const { message, templateId } = await this.templates.renderMessage(tenantId, 'boarding_qr', {
      patient_name: patient.name,
    });

    const log = await this.prisma.notificationLog.create({
      data: {
        tenantId,
        templateId,
        patientId: patient.id,
        tripId,
        routeId: trip.routeId,
        phone: patient.phone,
        message,
        status: 'PENDING',
        maxRetries: MAX_RETRIES,
      },
    });

    // Send QR image with caption
    const sendResult = await this.adapter.sendImageBase64(patient.phone, qrDataUrl, message);
    await this.updateLogFromResult(log.id, sendResult, patient.phone, message);

    this.logger.log(`[QR] Boarding QR sent to ${patient.phone} → status=${sendResult.status} logId=${log.id}`);
    return { logId: log.id, status: sendResult.status };
  }

  /** Sends GPS location to a phone */
  async sendLocation(phone: string, lat: number, lng: number, address?: string) {
    this.logger.log(`[WHATSAPP] sendLocation phone=${phone}`);
    return this.adapter.sendLocation(phone, lat, lng, address);
  }

  /** Sends a link with title */
  async sendLink(phone: string, url: string, title: string) {
    this.logger.log(`[WHATSAPP] sendLink phone=${phone}`);
    return this.adapter.sendLink(phone, url, title);
  }

  // ─── Operational Event Helpers ─────────────────────────────────────────────

  async notifyAppointmentConfirmed(tenantId: string, patientId: string, tripId: string, vars: Record<string, string>) {
    return this.sendForPatient(tenantId, patientId, tripId, 'appointment_confirmation', vars);
  }

  async notifyDriverArriving(tenantId: string, patientId: string, tripId: string, routeId: string, vars: Record<string, string>) {
    return this.sendForPatient(tenantId, patientId, tripId, 'driver_arriving', vars, routeId);
  }

  async notifyBoardingConfirmed(tenantId: string, patientId: string, tripId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { name: true } });
    return this.sendForPatient(tenantId, patientId, tripId, 'boarding_confirmed', { patient_name: patient?.name ?? '' });
  }

  async notifyNoShow(tenantId: string, patientId: string, tripId: string) {
    return this.sendForPatient(tenantId, patientId, tripId, 'no_show', {});
  }

  async notifyTripCompleted(tenantId: string, patientId: string, tripId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { name: true } });
    return this.sendForPatient(tenantId, patientId, tripId, 'trip_completed', { patient_name: patient?.name ?? '' });
  }

  async notifyRouteStarted(tenantId: string, patientId: string, tripId: string, routeId: string) {
    return this.sendForPatient(tenantId, patientId, tripId, 'route_started', {}, routeId);
  }

  // ─── Board QR Validate ────────────────────────────────────────────────────

  /**
   * Validates a boarding QR scan from the Flutter driver app.
   * Accepts either a patient qrToken or a TripToken (BOARDING) UUID.
   * Returns patient, trip, status, and alreadyBoarded flag.
   */
  async validateBoardingQr(
    token: string,
    context: { vehicleId?: string; routeId?: string; deviceId?: string; source?: string },
  ): Promise<{
    valid: boolean;
    alreadyBoarded: boolean;
    patient?: Record<string, unknown>;
    trip?: Record<string, unknown>;
    status?: string;
    message?: string;
  }> {
    this.logger.log(`[BOARDING] validateBoardingQr token=${token.substring(0, 8)}… source=${context.source ?? '-'}`);

    // Try as Patient.qrToken first
    const patient = await this.prisma.patient.findFirst({
      where: { qrToken: token, qrActive: true },
      select: { id: true, name: true, qrToken: true, qrActive: true, qrExpiresAt: true, tenantId: true },
    });

    if (patient) {
      // Validate QR expiry
      if (patient.qrExpiresAt && patient.qrExpiresAt < new Date()) {
        this.logger.warn(`[BOARDING] qrToken expired patientId=${patient.id}`);
        return { valid: false, alreadyBoarded: false, message: 'QR expirado — solicite novo QR ao operador' };
      }

      // Find active trip for this patient in the given route
      const trip = await this.prisma.trip.findFirst({
        where: {
          patientId: patient.id,
          ...(context.routeId ? { routeId: context.routeId } : {}),
          status: { notIn: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] as any },
        },
        include: { route: { select: { id: true, destination: true, date: true } } },
        orderBy: { route: { date: 'desc' } },
      });

      if (!trip) {
        return { valid: false, alreadyBoarded: false, message: 'Nenhuma viagem ativa encontrada para este paciente' };
      }

      const alreadyBoarded = trip.status === 'BOARDED' || trip.status === 'IN_TRANSIT' || !!trip.boardedAt;
      this.logger.log(`[BOARDING] Valid qrToken patientId=${patient.id} tripId=${trip.id} alreadyBoarded=${alreadyBoarded}`);

      return {
        valid: true,
        alreadyBoarded,
        patient: { id: patient.id, name: patient.name },
        trip: { id: trip.id, status: trip.status, destination: (trip.route as any)?.destination },
        status: trip.status,
      };
    }

    // Try as TripToken
    const tripToken = await this.prisma.tripToken.findFirst({
      where: { token, type: 'BOARDING' },
      include: {
        patient: { select: { id: true, name: true } },
        trip: { select: { id: true, status: true, boardedAt: true, route: { select: { destination: true } } } },
      },
    });

    if (!tripToken) {
      return { valid: false, alreadyBoarded: false, message: 'QR inválido ou não reconhecido' };
    }

    const terminalStatuses = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];
    if (terminalStatuses.includes(tripToken.trip.status)) {
      return { valid: false, alreadyBoarded: false, message: 'Viagem já finalizada' };
    }

    const alreadyBoarded = tripToken.trip.status === 'BOARDED' || tripToken.trip.status === 'IN_TRANSIT' || !!tripToken.trip.boardedAt;

    return {
      valid: true,
      alreadyBoarded,
      patient: { id: tripToken.patient.id, name: tripToken.patient.name },
      trip: { id: tripToken.trip.id, status: tripToken.trip.status, destination: (tripToken.trip as any).route?.destination },
      status: tripToken.trip.status,
    };
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private async sendForPatient(
    tenantId: string,
    patientId: string,
    tripId: string,
    key: NotificationTemplateKey,
    variables: Record<string, string>,
    routeId?: string,
  ) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { phone: true } });
    if (!patient?.phone) {
      this.logger.warn(`[WHATSAPP] Patient ${patientId} has no phone — skipping key=${key}`);
      return { status: 'SKIPPED' };
    }
    return this.sendFromTemplate({ tenantId, patientId, tripId, routeId, phone: patient.phone, templateKey: key, variables });
  }

  private async doSend(logId: string, phone: string, message: string): Promise<{ logId: string; status: string }> {
    const result = await this.adapter.sendText(phone, message);
    await this.updateLogFromResult(logId, result, phone, message);
    return { logId, status: result.status };
  }

  private async updateLogFromResult(
    logId: string,
    result: { status: string; messageId?: string; error?: string },
    _phone: string,
    _message: string,
  ) {
    const now = new Date();
    if (result.status === 'SENT') {
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'SENT', sentAt: now, providerMessageId: result.messageId ?? null },
      });
    } else {
      await this.prisma.notificationLog.update({
        where: { id: logId },
        data: { status: 'FAILED', failedReason: result.error ?? 'unknown', retryCount: { increment: 1 } } as any,
      });
      this.logger.warn(`[MESSAGE] Send failed logId=${logId} reason=${result.error}`);
    }
  }

  /** Retries a specific log entry (called by WhatsappQueueService) */
  async retrySend(logId: string): Promise<void> {
    const log = await this.prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!log || log.retryCount >= log.maxRetries) return;

    this.logger.log(`[QUEUE] Retrying logId=${logId} attempt=${log.retryCount + 1}/${log.maxRetries}`);
    const result = await this.adapter.sendText(log.phone, log.message);
    await this.updateLogFromResult(logId, result, log.phone, log.message);
  }

  /** Manual retry of a specific log (from admin endpoint) */
  async manualRetry(logId: string, tenantId: string) {
    const log = await this.prisma.notificationLog.findFirst({ where: { id: logId, tenantId } });
    if (!log) throw new Error('Log not found');
    await this.prisma.notificationLog.update({ where: { id: logId }, data: { status: 'PENDING', retryCount: 0, failedReason: null } });
    return this.doSend(logId, log.phone, log.message);
  }

  /** Suppresses duplicates: same tenant+phone+key within DEDUP_WINDOW_MS */
  private async checkDuplicate(tenantId: string, phone: string, key: string): Promise<boolean> {
    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const recent = await this.prisma.notificationLog.findFirst({
      where: {
        tenantId,
        phone,
        status: { in: ['PENDING', 'SENT'] as any },
        createdAt: { gte: since },
        template: { key },
      },
    });
    return !!recent;
  }
}
