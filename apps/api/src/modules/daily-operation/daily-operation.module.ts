import { Module } from '@nestjs/common';
import { DailyOperationController } from './daily-operation.controller';
import { DailyOperationService } from './daily-operation.service';

@Module({
  controllers: [DailyOperationController],
  providers: [DailyOperationService],
  exports: [DailyOperationService],
})
export class DailyOperationModule {}
