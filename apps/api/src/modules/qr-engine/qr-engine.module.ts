import { Module } from '@nestjs/common';
import { QrEngineController } from './qr-engine.controller';
import { QrEngineService } from './qr-engine.service';

@Module({
  controllers: [QrEngineController],
  providers: [QrEngineService],
  exports: [QrEngineService],
})
export class QrEngineModule {}

