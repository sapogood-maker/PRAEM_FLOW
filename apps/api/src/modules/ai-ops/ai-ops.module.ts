import { Module } from '@nestjs/common';
import { AiOpsController } from './ai-ops.controller';
import { AiOpsService } from './ai-ops.service';

@Module({
  controllers: [AiOpsController],
  providers: [AiOpsService],
  exports: [AiOpsService],
})
export class AiOpsModule {}
