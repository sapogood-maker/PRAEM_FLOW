import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DispatchSuggestionService } from './dispatch-suggestion.service';

interface AuthRequest { user: { tenantId: string; userId: string } }

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatchSuggestionService: DispatchSuggestionService) {}

  @Post('suggestions')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR')
  suggestions(@Request() req: AuthRequest, @Body() body?: { limit?: number }) {
    const safe = sanitizePayload(body ?? {});
    return this.dispatchSuggestionService.generateSuggestions(req.user.tenantId, {
      limit: typeof safe.limit === 'number' ? safe.limit : undefined,
    });
  }

  @Post('approve')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR', 'SUPERVISOR')
  approve(@Request() req: AuthRequest, @Body() body: { suggestionId: string }) {
    const safe = sanitizePayload(body);
    return this.dispatchSuggestionService.approveSuggestion(
      req.user.tenantId,
      safe.suggestionId,
      req.user.userId,
    );
  }
}

