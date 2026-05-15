import { Controller, Get, Param, Post } from '@nestjs/common';
import { TripsService } from './trips.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  findAll() {
    return this.tripsService.findAll();
  }

  @Post(':id/board')
  board(@Param('id') id: string) {
    return this.tripsService.board(id);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string) {
    return this.tripsService.complete(id);
  }
}
