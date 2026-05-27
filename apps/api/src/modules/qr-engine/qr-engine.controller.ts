import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('qr-engine')
export class QrEngineController {
  constructor(private readonly service: QrEngineService) {}

  @Post('generate')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'DRIVER', 'ADMIN_PREFEITURA')
  generate(@Request() req: AuthRequest, @Body() body: GenerateQrPayloadDto) {
    return this.service.generatePayload(req.user.tenantId, sanitizePayload(body));
  }

  @Post('validate')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR', 'DRIVER', 'ADMIN_PREFEITURA')
  validate(@Request() req: AuthRequest, @Body() body: ValidateQrPayloadDto) {
    return this.service.validatePayload(req.user.tenantId, sanitizePayload(body));
  }
}

