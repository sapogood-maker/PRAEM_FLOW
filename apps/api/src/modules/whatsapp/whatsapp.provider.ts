import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZApiAdapter } from './zapi.adapter';
import { IMessageProvider, ProviderSendResponse } from './whatsapp.types';

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';

type ProviderKey = 'ZAPI' | 'META_CLOUD' | 'EVOLUTION' | 'TWILIO' | 'BAILEYS';

class PlaceholderProvider implements IMessageProvider {
  private readonly logger = new Logger(PlaceholderProvider.name);

  constructor(private readonly providerName: ProviderKey) {}

  private unsupported(): ProviderSendResponse {
    this.logger.warn(`[WHATSAPP] Provider ${this.providerName} ainda não implementado neste deploy`);
    return {
      status: 'FAILED',
      error: `provider_not_implemented:${this.providerName}`,
    };
  }

  async sendText(_phone: string, _message: string): Promise<ProviderSendResponse> {
    return this.unsupported();
  }

  async sendImage(_phone: string, _imageUrl: string, _caption?: string): Promise<ProviderSendResponse> {
    return this.unsupported();
  }

  async sendImageBase64(_phone: string, _base64: string, _caption?: string): Promise<ProviderSendResponse> {
    return this.unsupported();
  }

  async sendLocation(_phone: string, _lat: number, _lng: number, _address?: string): Promise<ProviderSendResponse> {
    return this.unsupported();
  }

  async sendLink(_phone: string, _url: string, _title: string): Promise<ProviderSendResponse> {
    return this.unsupported();
  }
}

export function resolveWhatsappProvider(
  config: ConfigService,
  zapi: ZApiAdapter,
): IMessageProvider {
  const provider = String(config.get<string>('WHATSAPP_PROVIDER', 'ZAPI')).toUpperCase() as ProviderKey;
  switch (provider) {
    case 'ZAPI':
      return zapi;
    case 'META_CLOUD':
    case 'EVOLUTION':
    case 'TWILIO':
    case 'BAILEYS':
      return new PlaceholderProvider(provider);
    default:
      return zapi;
  }
}
