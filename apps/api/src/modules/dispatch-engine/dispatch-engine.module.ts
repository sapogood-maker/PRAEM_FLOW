import { Module } from '@nestjs/common';
import { DispatchEngineController } from './dispatch-engine.controller';
import { DispatchEngineService } from './dispatch-engine.service';

@Module({
  controllers: [DispatchEngineController],
  providers: [DispatchEngineService],
  exports: [DispatchEngineService],
})
export class DispatchEngineModule {}

