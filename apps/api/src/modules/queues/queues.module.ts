import { Module } from '@nestjs/common';
import { QueuesController } from './queues.controller';
import { QueuesService } from './queues.service';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationEventsModule } from '../operation-events/operation-events.module';

@Module({
  imports: [GatewaysModule, OperationEventsModule],
  controllers: [QueuesController],
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
