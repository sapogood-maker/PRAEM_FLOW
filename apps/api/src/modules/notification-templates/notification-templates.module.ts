import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationTemplatesController } from './controllers/notification-templates.controller';
import { NotificationTemplateRenderer } from './renderers/notification-template.renderer';
import { NotificationTemplatePreviewService } from './preview/notification-template.preview.service';
import { NotificationTemplatesService } from './services/notification-templates.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationTemplatesController],
  providers: [
    NotificationTemplateRenderer,
    NotificationTemplatePreviewService,
    NotificationTemplatesService,
  ],
  exports: [NotificationTemplatesService],
})
export class NotificationTemplatesModule {}

