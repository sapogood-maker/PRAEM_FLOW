import { Module } from '@nestjs/common';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { GatewaysModule } from '../../gateways/gateways.module';
import { OperationalFlowModule } from '../operational-flow/operational-flow.module';

@Module({
  imports: [GatewaysModule, OperationalFlowModule],
  controllers: [PatientsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
