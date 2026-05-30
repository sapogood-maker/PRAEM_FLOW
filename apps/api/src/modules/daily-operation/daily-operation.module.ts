import { Module } from '@nestjs/common';
import { DailyOperationController } from './daily-operation.controller';
import { DailyOperationService } from './daily-operation.service';
import { OperationBootstrapService } from './operation-bootstrap.service';

@Module({
  controllers: [DailyOperationController],
  providers: [DailyOperationService, OperationBootstrapService],
  exports: [DailyOperationService],
})
export class DailyOperationModule {}
