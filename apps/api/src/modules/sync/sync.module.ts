import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RoutesModule } from '../routes/routes.module';
import { TripsModule } from '../trips/trips.module';
import { TripStopsModule } from '../trip-stops/trip-stops.module';
import { TrackingModule } from '../tracking/tracking.module';
import { OperationalFlowModule } from '../operational-flow/operational-flow.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [
    PrismaModule,
    RoutesModule,
    TripsModule,
    TripStopsModule,
    TrackingModule,
    OperationalFlowModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
