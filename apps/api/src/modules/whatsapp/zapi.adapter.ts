import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMessageProvider, ProviderSendResponse } from './whatsapp.types';

/**
 * Z-API adapter — implements IMessageProvider using the Z-API REST API.
 * Replace this class with MetaCloudAdapter / ZenviaAdapter / TwilioAdapter
 * to migrate providers without changing any business logic.
 *
 * Docs: https://developer.z-api.io/
 */
@Injectable()
export class ZApiAdapter implements IMessageProvider {
  private readonly logger = new Logger(ZApiAdapter.name);
  private readonly baseUrl: string;
  private readonly instanceId: string;
  private readonly token: string;
  private readonly enabled: boolean;
  private readonly timeoutMs = 12_000;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('ZAPI_BASE_URL', 'https://api.z-api.io');
    this.instanceId = config.get<string>('ZAPI_INSTANCE_ID', '');
    this.token = config.get<string>('ZAPI_TOKEN', '');
    this.enabled = config.get<string>('WHATSAPP_ENABLED', 'false') === 'true';
  }

  private get apiBase(): string {
    return `${this.baseUrl}/instances/${this.instanceId}/token/${this.token}`;
  }

  /**
   * Normalizes a Brazilian phone number to Z-API format: 55AANNNNNNNN[N]
   * Accepts formats: +5545999999999, 5545999999999, 45999999999, etc.
   */
  static normalizePhone(raw: string): string | null {
    const digits = raw.replace(/\D/g, '');
    // Already has country code
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
    // Without country code (DDD + 8-9 digits)
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return null;
  }

  private async post(endpoint: string, body: Record<string, unknown>): Promise<ProviderSendResponse> {
    if (!this.enabled) {
      this.logger.debug(`[ZAPI] WHATSAPP_ENABLED=false — dry-run (${endpoint})`);
      return { status: 'SENT', messageId: `dryrun-${Date.now()}` };
    }
    if (!this.instanceId || !this.token) {
      this.logger.warn('[ZAPI] ZAPI_INSTANCE_ID or ZAPI_TOKEN not configured');
      return { status: 'FAILED', error: 'Z-API credentials not configured' };
    }

    const url = `${this.apiBase}/${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': this.token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = (await resp.json()) as Record<string, unknown>;

      if (!resp.ok) {
        const err = JSON.stringify(data);
        this.logger.warn(`[ZAPI] HTTP ${resp.status} at ${endpoint}: ${err}`);
        return { status: 'FAILED', error: `HTTP ${resp.status}: ${err}`, raw: data };
      }

      const messageId = String(data.zaapId ?? data.messageId ?? data.id ?? '');
      this.logger.log(`[ZAPI] ✓ ${endpoint} → messageId=${messageId}`);
      return { status: 'SENT', messageId, raw: data };
    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[ZAPI] ✗ ${endpoint}: ${msg}`);
      return { status: 'FAILED', error: msg };
    }
  }

  async sendText(phone: string, message: string): Promise<ProviderSendResponse> {
    const normalized = ZApiAdapter.normalizePhone(phone);
    if (!normalized) {
      this.logger.warn(`[ZAPI] Invalid phone number: ${phone}`);
      return { status: 'FAILED', error: 'invalid_phone' };
    }
    this.logger.log(`[WHATSAPP] sendText → phone=${normalized}`);
    return this.post('send-text', { phone: normalized, message });
  }

  async sendImage(phone: string, imageUrl: string, caption?: string): Promise<ProviderSendResponse> {
    const normalized = ZApiAdapter.normalizePhone(phone);
    if (!normalized) return { status: 'FAILED', error: 'invalid_phone' };
    this.logger.log(`[WHATSAPP] sendImage → phone=${normalized}`);
    return this.post('send-image', { phone: normalized, image: imageUrl, caption: caption ?? '' });
  }

  async sendImageBase64(phone: string, base64: string, caption?: string): Promise<ProviderSendResponse> {
    const normalized = ZApiAdapter.normalizePhone(phone);
    if (!normalized) return { status: 'FAILED', error: 'invalid_phone' };
    this.logger.log(`[WHATSAPP] sendImageBase64 → phone=${normalized}`);
    return this.post('send-image', { phone: normalized, image: base64, caption: caption ?? '' });
  }

  async sendLocation(phone: string, lat: number, lng: number, address?: string): Promise<ProviderSendResponse> {
    const normalized = ZApiAdapter.normalizePhone(phone);
    if (!normalized) return { status: 'FAILED', error: 'invalid_phone' };
    this.logger.log(`[WHATSAPP] sendLocation → phone=${normalized} lat=${lat} lng=${lng}`);
    return this.post('send-location', { phone: normalized, lat, lng, address: address ?? '' });
  }

  async sendLink(phone: string, url: string, title: string): Promise<ProviderSendResponse> {
    const normalized = ZApiAdapter.normalizePhone(phone);
    if (!normalized) return { status: 'FAILED', error: 'invalid_phone' };
    this.logger.log(`[WHATSAPP] sendLink → phone=${normalized}`);
    return this.post('send-link', { phone: normalized, value: url, linkTitle: title });
  }
}
