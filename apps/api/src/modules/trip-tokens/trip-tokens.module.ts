import { Module } from '@nestjs/common';
import { TripTokensController } from './trip-tokens.controller';
import { TripTokensService } from './trip-tokens.service';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationEventsModule } from '../operation-events/operation-events.module';

@Module({
  imports: [GatewaysModule, OperationEventsModule],
  controllers: [TripTokensController],
  providers: [TripTokensService],
  exports: [TripTokensService],
})
export class TripTokensModule {}
