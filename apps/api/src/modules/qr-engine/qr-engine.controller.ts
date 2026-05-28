import { Body, Controller, Get, Param, Post, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GenerateQrPayloadDto } from './dto/generate-qr-payload.dto';
import { ValidateQrPayloadDto } from './dto/validate-qr-payload.dto';
import { QrEngineService } from './qr-engine.service';

interface AuthRequest {
  user: { tenantId: string; role: string };
}

@Controller('qr-engine')
export class QrEngineController {
  constructor(private readonly service: QrEngineService) {}

  /** Public endpoint: renders a trip token as QR PNG for the patient confirmation page */
  @Get('image/:token')
  async image(@Param('token') token: string, @Res() res: Response) {
    const buffer = await QRCode.toBuffer(token, { type: 'png', width: 300, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('generate')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'DRIVER', 'ADMIN_PREFEITURA')
  generate(@Request() req: AuthRequest, @Body() body: GenerateQrPayloadDto) {
    return this.service.generatePayload(req.user.tenantId, sanitizePayload(body));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('validate')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'DRIVER', 'ADMIN_PREFEITURA')
  validate(@Request() req: AuthRequest, @Body() body: ValidateQrPayloadDto) {
    return this.service.validatePayload(req.user.tenantId, sanitizePayload(body));
  }
}

