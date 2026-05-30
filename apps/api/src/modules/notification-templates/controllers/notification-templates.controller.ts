import { Body, Controller, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { NotificationTemplatesService } from '../services/notification-templates.service';

interface AuthRequest {
  user: { tenantId: string; userId: string; role: string };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notification-templates')
export class NotificationTemplatesController {
  constructor(private readonly service: NotificationTemplatesService) {}

  @Get('metadata')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  metadata() {
    return this.service.listMetadata();
  }

  @Post('preview')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  preview(@Body() body: { message: string; context?: Record<string, string> }) {
    return this.service.preview(body.message, body.context);
  }

  @Post('render')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  renderByKey(
    @Request() req: AuthRequest,
    @Body() body: { key: string; context?: Record<string, string> },
  ) {
    return this.service.renderByKey(req.user.tenantId, body.key, body.context);
  }

  @Post('seed-defaults')
  @Roles('ADMIN')
  seedDefaults(@Request() req: AuthRequest) {
    return this.service.seedDefaults(req.user.tenantId);
  }

  @Get()
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  findAll(@Request() req: AuthRequest) {
    return this.service.findAll(req.user.tenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'OPERATOR', 'COORDINATOR')
  findOne(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(id, req.user.tenantId);
  }

  @Post()
  @Roles('ADMIN', 'OPERATOR')
  create(
    @Request() req: AuthRequest,
    @Body() body: { key: string; title: string; message: string; category?: string; variables?: string[] },
  ) {
    return this.service.create(req.user.tenantId, body);
  }

  @Put(':id')
  @Roles('ADMIN', 'OPERATOR')
  update(
    @Request() req: AuthRequest,
    @Param('id') id: string,
    @Body()
    body: Partial<{ title: string; message: string; category: string; variables: string[]; active: boolean }>,
  ) {
    return this.service.update(id, req.user.tenantId, body);
  }

  @Post(':id/duplicate')
  @Roles('ADMIN', 'OPERATOR')
  duplicate(@Request() req: AuthRequest, @Param('id') id: string) {
    return this.service.duplicate(id, req.user.tenantId);
  }

  @Put(':id/active')
  @Roles('ADMIN', 'OPERATOR')
  setActive(@Request() req: AuthRequest, @Param('id') id: string, @Body() body: { active: boolean }) {
    return this.service.setActive(id, req.user.tenantId, body.active);
  }
}

