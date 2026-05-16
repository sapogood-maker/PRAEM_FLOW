import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { OperationsGateway } from './operations.gateway';

@Module({
  providers: [RealtimeGateway, OperationsGateway],
  exports: [RealtimeGateway, OperationsGateway],
})
export class GatewaysModule {}
