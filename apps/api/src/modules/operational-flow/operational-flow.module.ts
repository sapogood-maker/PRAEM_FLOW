import { Module } from '@nestjs/common';
import { GatewaysModule } from '../../gateways/gateways.module';
import { AuditModule } from '../audit/audit.module';
import { OperationalFlowService } from './operational-flow.service';

@Module({
  imports: [GatewaysModule, AuditModule],
  providers: [OperationalFlowService],
  exports: [OperationalFlowService],
})
export class OperationalFlowModule {}
