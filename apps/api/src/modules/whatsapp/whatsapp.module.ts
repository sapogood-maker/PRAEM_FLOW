import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { ZApiAdapter } from './zapi.adapter';
import { WhatsappTemplateService } from './whatsapp-template.service';
import { WhatsappQueueService } from './whatsapp-queue.service';
import { WhatsappService } from './whatsapp.service';
import { WHATSAPP_PROVIDER, resolveWhatsappProvider } from './whatsapp.provider';
import {
  NotificationsController,
  BoardingController,
  WhatsappTemplatesController,
  WhatsappAdminController,
} from './whatsapp.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [
    NotificationsController,
    BoardingController,
    WhatsappTemplatesController,
    WhatsappAdminController,
  ],
  providers: [
    ZApiAdapter,
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService, ZApiAdapter],
      useFactory: resolveWhatsappProvider,
    },
    WhatsappTemplateService,
    WhatsappQueueService,
    WhatsappService,
  ],
  exports: [WhatsappService, WhatsappTemplateService],
})
export class WhatsappModule {}
