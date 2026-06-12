import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DailyOperationService } from './daily-operation.service';

/**
 * Runs at 00:01 every day and ensures every active tenant starts the day
 * with an operational DailyOperation record and its default shifts.
 */
@Injectable()
export class OperationBootstrapService {
  private readonly logger = new Logger(OperationBootstrapService.name);

  constructor(private readonly dailyOperationService: DailyOperationService) {}

  /** Daily bootstrap at 00:01 — ensures every tenant has today's operation ready. */
  @Cron('1 0 * * *', { name: 'daily-operation-bootstrap' })
  async handleDailyBootstrap(): Promise<void> {
    this.logger.log('Running daily operation bootstrap...');
    try {
      await this.dailyOperationService.bootstrapAllTenants();
      this.logger.log('Daily operation bootstrap completed successfully.');
    } catch (err) {
      this.logger.error('Daily operation bootstrap failed', err);
    }
  }

  /** Hourly reconciliation to close orphan operations left open after route/trip finalization. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'daily-operation-reconcile-orphans' })
  async handleOrphanReconciliation(): Promise<void> {
    this.logger.log('Running orphan daily operation reconciliation...');
    try {
      const summary = await this.dailyOperationService.reconcileOperationsAllTenants();
      const scanned = summary.reduce((acc, row) => acc + row.scanned, 0);
      const closed = summary.reduce((acc, row) => acc + row.closed, 0);
      this.logger.log(`Orphan daily operation reconciliation completed. scanned=${scanned} closed=${closed}`);
    } catch (err) {
      this.logger.error('Orphan daily operation reconciliation failed', err);
    }
  }
}
