import { Module } from '@nestjs/common';
import { TripTokensController } from './trip-tokens.controller';
import { TripTokensService } from './trip-tokens.service';
import { GatewaysModule } from '../../gateways/gateways.module';

@Module({
  imports: [GatewaysModule],
  controllers: [TripTokensController],
  providers: [TripTokensService],
  exports: [TripTokensService],
})
export class TripTokensModule {}
