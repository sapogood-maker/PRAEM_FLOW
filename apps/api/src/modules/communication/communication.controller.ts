import { Body, Controller, Post } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { CommunicationService } from './communication.service';

@Controller('communication')
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Post('send')
  send(@Body() body: { tenantId: string; to: string; message: string; provider: 'telegram' | 'whatsapp' | 'sms' }) {
    return this.communicationService.send(sanitizePayload(body));
  }
}
