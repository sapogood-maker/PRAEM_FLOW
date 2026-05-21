import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { OperationsGateway } from './operations.gateway';
import { AuthModule } from '../modules/auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, OperationsGateway],
  exports: [RealtimeGateway, OperationsGateway],
})
export class GatewaysModule {}
