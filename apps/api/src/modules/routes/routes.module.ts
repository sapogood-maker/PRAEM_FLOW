import { Module } from '@nestjs/common';
import { RoutesController } from './routes.controller';
import { RoutesService } from './routes.service';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationalFlowModule } from '../operational-flow/operational-flow.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [GatewaysModule, OperationalFlowModule, WhatsappModule],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
