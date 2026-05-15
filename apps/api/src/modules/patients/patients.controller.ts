import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { PatientsService } from './patients.service';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
  ) {
    return this.patientsService.list({ search, priority, status });
  }

  @Post()
  create(@Body() body: any) {
    const created = this.patientsService.create(sanitizePayload(body));
    return { created: true, id: created.id };
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    const updated = this.patientsService.update(id, sanitizePayload(body));
    return { updated: true, id: updated.id };
  }

  @Get(':id/qr')
  qr(@Param('id') id: string) {
    return this.patientsService.qr(id);
  }

  @Post('scan')
  scan(@Body() body: { qrCode?: string; cpf?: string }) {
    return this.patientsService.scan(body);
  }
}
