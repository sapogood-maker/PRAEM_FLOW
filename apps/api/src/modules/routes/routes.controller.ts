import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  findAll() {
    return this.routesService.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.routesService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.routesService.update(id, body);
  }

  @Post(':id/optimize')
  optimize(@Param('id') id: string) {
    return this.routesService.optimize(id);
  }
}
