import { Module } from '@nestjs/common';
import { GatewaysModule } from '../../gateways/gateways.module';
import { AuditModule } from '../audit/audit.module';
import { OperationEventsModule } from '../operation-events/operation-events.module';
import { OperationalFlowService } from './operational-flow.service';
import { DailyOperationModule } from '../daily-operation/daily-operation.module';

@Module({
  imports: [GatewaysModule, AuditModule, OperationEventsModule, DailyOperationModule],
  providers: [OperationalFlowService],
  exports: [OperationalFlowService],
})
export class OperationalFlowModule {}
