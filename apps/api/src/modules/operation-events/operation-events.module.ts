import { Module } from '@nestjs/common';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationEventsService } from './operation-events.service';

@Module({
  imports: [GatewaysModule],
  providers: [OperationEventsService],
  exports: [OperationEventsService],
})
export class OperationEventsModule {}
