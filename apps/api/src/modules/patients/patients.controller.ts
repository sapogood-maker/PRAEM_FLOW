import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
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
    return this.patientsService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.patientsService.update(id, body);
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
