import { Module } from '@nestjs/common';
import { SchedulingImportController } from './scheduling-import.controller';
import { SchedulingImportService } from './scheduling-import.service';
import { PatientsModule } from '../patients/patients.module';
import { QueuesModule } from '../queues/queues.module';
import { RoutesModule } from '../routes/routes.module';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [PatientsModule, QueuesModule, RoutesModule, TripsModule],
  controllers: [SchedulingImportController],
  providers: [SchedulingImportService],
})
export class SchedulingImportModule {}

