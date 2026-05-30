import { Module } from '@nestjs/common';
import { SchedulingImportController } from './scheduling-import.controller';
import { SchedulingImportService } from './scheduling-import.service';
import { DispatchEngineModule } from '../dispatch-engine/dispatch-engine.module';
@Module({
  imports: [DispatchEngineModule],
  controllers: [SchedulingImportController],
  providers: [SchedulingImportService],
})
export class SchedulingImportModule {}
