import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PatientsService } from './patients.service';

interface AuthRequest {
  user: { tenantId: string; userId: string };
}

@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  findAll(
    @Request() req: AuthRequest,
    @Query('search') search?: string,
    @Query('clinicalRisk') clinicalRisk?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.patientsService.list({
      tenantId: req.user.tenantId,
      search,
      clinicalRisk,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get(':id')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.patientsService.findOne(id, req.user.tenantId);
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() body: any) {
    return this.patientsService.create(req.user.tenantId, sanitizePayload(body));
  }

  @Put(':id')
  update(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: any) {
    return this.patientsService.update(id, req.user.tenantId, sanitizePayload(body));
  }

  @Delete(':id')
  remove(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.patientsService.remove(id, req.user.tenantId);
  }

  @Get(':id/qr')
  qr(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.patientsService.qr(id, req.user.tenantId);
  }

  @Post('scan')
  scan(@Request() req: AuthRequest, @Body() body: { qrCode?: string; cpf?: string }) {
    return this.patientsService.scan(req.user.tenantId, body);
  }
}

