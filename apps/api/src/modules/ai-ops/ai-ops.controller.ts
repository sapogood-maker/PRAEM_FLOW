import { Controller, Get } from '@nestjs/common';
import { AiOpsService } from './ai-ops.service';

@Controller('ai-ops')
export class AiOpsController {
  constructor(private readonly service: AiOpsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
