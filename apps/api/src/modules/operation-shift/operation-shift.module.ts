import { Module } from '@nestjs/common';
import { OperationShiftController } from './operation-shift.controller';
import { OperationShiftService } from './operation-shift.service';

@Module({
  controllers: [OperationShiftController],
  providers: [OperationShiftService],
  exports: [OperationShiftService],
})
export class OperationShiftModule {}
