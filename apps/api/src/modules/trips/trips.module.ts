import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationalFlowModule } from '../operational-flow/operational-flow.module';

@Module({
  imports: [GatewaysModule, OperationalFlowModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
