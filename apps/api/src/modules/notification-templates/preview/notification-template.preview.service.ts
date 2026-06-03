import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as QRCode from 'qrcode';
import { NotificationTemplateRenderer } from '../renderers/notification-template.renderer';
import { PREVIEW_SAMPLE_CONTEXT, SUPPORTED_TEMPLATE_VARIABLES } from '../variables/notification-template.variables';

@Injectable()
export class NotificationTemplatePreviewService {
  constructor(private readonly renderer: NotificationTemplateRenderer) {}

  async buildPreview(message: string, overrideContext?: Record<string, string>) {
    const context = {
      ...PREVIEW_SAMPLE_CONTEXT,
      ...(overrideContext ?? {}),
    };
    const renderedMessage = this.renderer.render(message, context);
    const usedVariables = this.renderer.extractVariables(message);
    const unsupportedVariables = usedVariables.filter(
      (variableName) => !SUPPORTED_TEMPLATE_VARIABLES.some((item) => item.key === variableName),
    );

    const qrCodeValue = context.qr_code ?? PREVIEW_SAMPLE_CONTEXT.qr_code;
    const qrCodeDataUrl = await QRCode.toDataURL(qrCodeValue, { type: 'image/png', width: 256, margin: 1 });

    return {
      renderedMessage,
      sampleData: context,
      qrCodeDataUrl,
      usedVariables,
      unsupportedVariables,
    };
  }
}

