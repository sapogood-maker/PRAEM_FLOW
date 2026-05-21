import { Module } from '@nestjs/common';
import { TripStopsController } from './trip-stops.controller';
import { TripStopsService } from './trip-stops.service';

@Module({
  controllers: [TripStopsController],
  providers: [TripStopsService],
  exports: [TripStopsService],
})
export class TripStopsModule {}
