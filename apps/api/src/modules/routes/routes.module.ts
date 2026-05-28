import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationalFlowModule } from '../operational-flow/operational-flow.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { TripTokensModule } from '../trip-tokens/trip-tokens.module';

@Module({
  imports: [GatewaysModule, OperationalFlowModule, WhatsappModule, TripTokensModule],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
