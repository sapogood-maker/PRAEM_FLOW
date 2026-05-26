import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ZApiAdapter } from './zapi.adapter';
import { WhatsappTemplateService } from './whatsapp-template.service';
import { WhatsappQueueService } from './whatsapp-queue.service';
import { WhatsappService } from './whatsapp.service';
import {
  NotificationsController,
  BoardingController,
  WhatsappTemplatesController,
  WhatsappAdminController,
} from './whatsapp.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    NotificationsController,
    BoardingController,
    WhatsappTemplatesController,
    WhatsappAdminController,
  ],
  providers: [
    ZApiAdapter,
    WhatsappTemplateService,
    WhatsappQueueService,
    WhatsappService,
  ],
  exports: [WhatsappService, WhatsappTemplateService],
})
export class WhatsappModule {}
