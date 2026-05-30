import { Body, Controller, Post } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';
import { CommunicationService, MessagePayload } from './communication.service';

@Controller('communication')
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Post('send')
  send(@Body() body: MessagePayload) {
    return this.communicationService.send(sanitizePayload(body));
  }
}
