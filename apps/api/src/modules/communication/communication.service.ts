import { Injectable } from '@nestjs/common';

export type CommunicationFlowType =
  | 'CONFIRMATION'
  | 'REMINDER'
  | 'CHANGE'
  | 'DELAY'
  | 'RETURN'
  | 'CANCELLATION';

export interface MessagePayload {
  tenantId: string;
  to: string;
  message: string;
  provider: 'telegram' | 'whatsapp' | 'sms' | 'voice_call';
  flow?: CommunicationFlowType;
}

interface MessageProvider {
  send(payload: MessagePayload): Promise<{ delivered: boolean; provider: string }>;
}

class TelegramProvider implements MessageProvider {
  async send() {
    return { delivered: true, provider: 'telegram' };
  }
}

class WhatsAppProvider implements MessageProvider {
  async send() {
    return { delivered: true, provider: 'whatsapp' };
  }
}

class SmsProvider implements MessageProvider {
  async send() {
    return { delivered: true, provider: 'sms' };
  }
}

class VoiceCallProvider implements MessageProvider {
  async send() {
    return { delivered: true, provider: 'voice_call' };
  }
}

@Injectable()
export class CommunicationService {
  private providers: Record<MessagePayload['provider'], MessageProvider> = {
    telegram: new TelegramProvider(),
    whatsapp: new WhatsAppProvider(),
    sms: new SmsProvider(),
    voice_call: new VoiceCallProvider(),
  };

  async send(payload: MessagePayload) {
    return this.providers[payload.provider].send(payload);
  }
}
