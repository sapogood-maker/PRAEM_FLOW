import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
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
    const created = this.routesService.create(sanitizePayload(body));
    return { created: true, id: created.id };
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    const updated = this.routesService.update(id, sanitizePayload(body));
    return { updated: updated.updated };
  }

  @Post(':id/optimize')
  optimize(@Param('id') id: string) {
    return this.routesService.optimize(id);
  }
}
