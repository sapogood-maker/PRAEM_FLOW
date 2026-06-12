import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TripTokensService, TokenType } from './trip-tokens.service';

interface AuthRequest { user: { tenantId: string } }

@Controller('trip-tokens')
export class TripTokensController {
  constructor(private readonly service: TripTokensService) {}

  /** Gera token para uma viagem (requer autenticação). */
  @UseGuards(JwtAuthGuard)
  @Post()
  generate(
    @Request() req: AuthRequest,
    @Body() body: { tripId: string; type: TokenType },
  ) {
    const { tripId, type } = sanitizePayload(body);
    return this.service.generate(req.user.tenantId, tripId, type);
  }

  /** Lista tokens de uma viagem (requer autenticação). */
  @UseGuards(JwtAuthGuard)
  @Get('trip/:tripId')
  listByTrip(@Request() req: AuthRequest, @Param('tripId') tripId: string) {
    return this.service.listByTrip(req.user.tenantId, tripId);
  }

  /** Endpoint público: retorna dados do token para exibição ao paciente. */
  @Get(':token/info')
  getPublic(@Param('token') token: string) {
    return this.service.getPublic(token);
  }

  /** Endpoint público: consome/usa o token e executa a ação operacional. */
  @Post(':token/use')
  useToken(
    @Param('token') token: string,
    @Body() body: { gpsLat?: number; gpsLng?: number; deviceInfo?: string },
    @Request() req: any,
  ) {
    const ip = req.headers?.['x-forwarded-for'] ?? req.ip ?? null;
    return this.service.use(token, { ip, ...sanitizePayload(body) });
  }
}
