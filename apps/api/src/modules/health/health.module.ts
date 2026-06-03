import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { GatewaysModule } from '../../gateways/gateways.module';

@Module({
  imports: [GatewaysModule],
  controllers: [HealthController],
})
export class HealthModule {}
