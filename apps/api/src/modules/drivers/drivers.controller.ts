import { Controller, Get } from '@nestjs/common';
import { DriversService } from './drivers.service';

@Controller('drivers')
export class DriversController {
  constructor(private readonly service: DriversService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
