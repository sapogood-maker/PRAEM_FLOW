import { Module } from '@nestjs/common';
import { HealthcareLocationsController } from './healthcare-locations.controller';
import { HealthcareLocationsService } from './healthcare-locations.service';

@Module({
  controllers: [HealthcareLocationsController],
  providers: [HealthcareLocationsService],
  exports: [HealthcareLocationsService],
})
export class HealthcareLocationsModule {}
