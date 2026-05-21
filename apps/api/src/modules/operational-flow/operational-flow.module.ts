import { Module } from '@nestjs/common';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationalFlowService } from './operational-flow.service';

@Module({
  imports: [GatewaysModule],
  providers: [OperationalFlowService],
  exports: [OperationalFlowService],
})
export class OperationalFlowModule {}
