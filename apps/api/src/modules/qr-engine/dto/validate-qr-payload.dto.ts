import type { QrCheckpoint } from './generate-qr-payload.dto';

export class ValidateQrPayloadDto {
  token?: string;
  payload?: Record<string, any>;
  expectedCheckpoint?: QrCheckpoint;
}

