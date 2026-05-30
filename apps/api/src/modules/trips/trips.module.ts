import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationalFlowModule } from '../operational-flow/operational-flow.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [GatewaysModule, OperationalFlowModule, WhatsappModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
