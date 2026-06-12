import { Controller, Get } from '@nestjs/common';
import { CheckpointsService } from './checkpoints.service';

@Controller('checkpoints')
export class CheckpointsController {
  constructor(private readonly service: CheckpointsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
