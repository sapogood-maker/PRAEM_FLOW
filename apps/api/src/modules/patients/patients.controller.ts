import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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

  /** Returns (or re-generates) the secure QR token for the patient */
  @Get(':id/qr')
  qr(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.patientsService.qr(id, req.user.tenantId);
  }

  /** Returns a PNG image of the QR Code for printing / display */
  @Get(':id/qr/image')
  async qrImage(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.patientsService.getQrImage(id, req.user.tenantId);
    res.set({ 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="qr.png"' });
    return new StreamableFile(buffer);
  }

  /**
   * Validates a QR Code scan — operational endpoint used by drivers / totems.
   * NEVER returns CPF or other sensitive PII.
   */
  @Post('qr/validate')
  validateQr(
    @Request() req: AuthRequest,
    @Body() body: { qrToken: string; vehicleId?: string; checkpoint?: string },
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.patientsService.validateQr(
      req.user.tenantId,
      sanitizePayload(body) as { qrToken: string; vehicleId?: string; checkpoint?: string },
      ip,
      userAgent,
    );
  }

  /** Returns QR scan history for a patient */
  @Get(':id/qr/logs')
  qrLogs(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.patientsService.qrAccessLogs(id, req.user.tenantId);
  }

  /** Deactivates the current QR token for a patient */
  @Post(':id/qr/revoke')
  revokeQr(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.patientsService.revokeQr(id, req.user.tenantId);
  }

  /** Legacy scan endpoint kept for backwards compat */
  @Post('scan')
  scan(@Request() req: AuthRequest, @Body() body: { qrCode?: string; cpf?: string }) {
    return this.patientsService.scan(req.user.tenantId, body);
  }
}

