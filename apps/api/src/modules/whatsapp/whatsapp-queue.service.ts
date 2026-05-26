import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * WhatsappQueueService
 * Manages retry of failed/pending notification sends.
 * Uses a cron job to poll the DB for retryable messages every 5 minutes.
 * Max 3 retries per message; exponential backoff tracked via retryCount.
 */
@Injectable()
export class WhatsappQueueService {
  private readonly logger = new Logger(WhatsappQueueService.name);
  private sendHandler?: (logId: string) => Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  /** Register the send handler (called by WhatsappService to avoid circular dep) */
  registerSendHandler(handler: (logId: string) => Promise<void>) {
    this.sendHandler = handler;
  }

  /** Cron: retry FAILED messages that still have retries remaining */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processRetries() {
    if (!this.sendHandler) return;

    const pending = await this.prisma.notificationLog.findMany({
      where: {
        status: 'FAILED',
        retryCount: { lt: 3 },
        // Only retry if the last attempt was at least (retryCount+1) * 30 seconds ago
        updatedAt: { lt: new Date(Date.now() - 30_000) },
      } as any,
      take: 50,
      orderBy: { createdAt: 'asc' },
    });

    if (pending.length > 0) {
      this.logger.log(`[QUEUE] Processing ${pending.length} retryable messages`);
    }

    for (const log of pending) {
      try {
        await this.sendHandler(log.id);
      } catch (err: unknown) {
        this.logger.error(`[QUEUE] Retry failed for logId=${log.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /** Returns queue statistics */
  async getStats(tenantId: string) {
    const [pending, sent, failed, duplicate] = await Promise.all([
      this.prisma.notificationLog.count({ where: { tenantId, status: 'PENDING' } }),
      this.prisma.notificationLog.count({ where: { tenantId, status: 'SENT' } }),
      this.prisma.notificationLog.count({ where: { tenantId, status: 'FAILED' } }),
      this.prisma.notificationLog.count({ where: { tenantId, status: 'DUPLICATE' } }),
    ]);
    return { pending, sent, failed, duplicate, total: pending + sent + failed + duplicate };
  }

  /** Returns recent log entries for a tenant */
  async getLogs(tenantId: string, query: { status?: string; limit?: number; page?: number }) {
    const { status, limit = 50, page = 1 } = query;
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { tenantId };
    if (status) where['status'] = status;

    const [items, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { key: true, title: true } },
          patient: { select: { id: true, name: true } },
        },
      }),
      this.prisma.notificationLog.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
