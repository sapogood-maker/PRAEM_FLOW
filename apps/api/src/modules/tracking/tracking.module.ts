import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { GatewaysModule } from '../../gateways/gateways.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { OperationalFlowModule } from '../operational-flow/operational-flow.module';

@Module({
  imports: [PrismaModule, GatewaysModule, AuditModule, OperationalFlowModule],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
