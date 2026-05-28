import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationTemplatePreviewService } from '../preview/notification-template.preview.service';
import { NotificationTemplateRenderer } from '../renderers/notification-template.renderer';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  NOTIFICATION_TEMPLATE_CATEGORIES,
  SUPPORTED_TEMPLATE_VARIABLES,
} from '../variables/notification-template.variables';
import {
  NotificationTemplateMetadata,
  NotificationTemplateRecord,
  NotificationTemplateResponse,
} from '../entities/notification-template.entity';

@Injectable()
export class NotificationTemplatesService {
  private readonly logger = new Logger(NotificationTemplatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: NotificationTemplateRenderer,
    private readonly previewService: NotificationTemplatePreviewService,
  ) {}

  async findAll(tenantId: string): Promise<NotificationTemplateResponse[]> {
    const templates = await this.prisma.notificationTemplate.findMany({
      where: { tenantId },
      orderBy: { key: 'asc' },
    });
    return templates.map((template) => this.toResponse(template as NotificationTemplateRecord));
  }

  async findOne(id: string, tenantId: string): Promise<NotificationTemplateResponse> {
    const template = await this.prisma.notificationTemplate.findFirst({ where: { id, tenantId } });
    if (!template) throw new NotFoundException('Template não encontrado');
    return this.toResponse(template as NotificationTemplateRecord);
  }

  async create(
    tenantId: string,
    payload: { key: string; title: string; message: string; category?: string; variables?: string[] },
  ): Promise<NotificationTemplateResponse> {
    const created = await this.prisma.notificationTemplate.create({
      data: {
        tenantId,
        key: payload.key,
        title: payload.title,
        message: payload.message,
        active: true,
        variables: {
          category: payload.category,
          variables: payload.variables ?? this.renderer.extractVariables(payload.message),
        },
      },
    });
    return this.toResponse(created as NotificationTemplateRecord);
  }

  async update(
    id: string,
    tenantId: string,
    payload: Partial<{ title: string; message: string; category: string; variables: string[]; active: boolean }>,
  ): Promise<NotificationTemplateResponse> {
    const existing = await this.prisma.notificationTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Template não encontrado');

    const currentMetadata = this.readMetadata(existing.variables);
    const nextMessage = payload.message ?? existing.message;
    const nextVariables = payload.variables ?? this.renderer.extractVariables(nextMessage);

    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        title: payload.title,
        message: payload.message,
        active: payload.active,
        variables: {
          category: payload.category ?? currentMetadata.category ?? null,
          variables: nextVariables,
        },
      },
    });
    return this.toResponse(updated as NotificationTemplateRecord);
  }

  async duplicate(id: string, tenantId: string): Promise<NotificationTemplateResponse> {
    const existing = await this.prisma.notificationTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Template não encontrado');

    const suffix = await this.nextDuplicateSuffix(tenantId, existing.key);
    const metadata = this.readMetadata(existing.variables);
    const duplicated = await this.prisma.notificationTemplate.create({
      data: {
        tenantId,
        key: `${existing.key}_copy_${suffix}`,
        title: `${existing.title} (Cópia ${suffix})`,
        message: existing.message,
        active: false,
        variables: metadata,
      },
    });
    return this.toResponse(duplicated as NotificationTemplateRecord);
  }

  async setActive(id: string, tenantId: string, active: boolean): Promise<NotificationTemplateResponse> {
    const existing = await this.prisma.notificationTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Template não encontrado');
    const updated = await this.prisma.notificationTemplate.update({
      where: { id },
      data: { active },
    });
    return this.toResponse(updated as NotificationTemplateRecord);
  }

  async seedDefaults(tenantId: string) {
    let seeded = 0;
    for (const template of DEFAULT_NOTIFICATION_TEMPLATES) {
      const existing = await this.prisma.notificationTemplate.findFirst({
        where: { tenantId, key: template.key },
      });
      if (existing) continue;
      await this.prisma.notificationTemplate.create({
        data: {
          tenantId,
          key: template.key,
          title: template.title,
          message: template.message,
          active: true,
          variables: {
            category: template.category,
            variables: template.variables,
          },
        },
      });
      seeded++;
    }
    this.logger.log(`[NOTIFICATION_TEMPLATES] seedDefaults tenantId=${tenantId} seeded=${seeded}`);
    return { seeded, totalDefaults: DEFAULT_NOTIFICATION_TEMPLATES.length };
  }

  async preview(message: string, context?: Record<string, string>) {
    return this.previewService.buildPreview(message, context);
  }

  async renderByKey(tenantId: string, key: string, context?: Record<string, string>) {
    const dbTemplate = await this.prisma.notificationTemplate.findFirst({
      where: { tenantId, key, active: true },
    });
    const fallback = DEFAULT_NOTIFICATION_TEMPLATES.find((item) => item.key === key);
    const rawMessage = dbTemplate?.message ?? fallback?.message ?? '';
    const rendered = this.renderer.render(rawMessage, context ?? {});
    return {
      key,
      templateId: dbTemplate?.id ?? null,
      rawMessage,
      renderedMessage: rendered,
    };
  }

  listMetadata() {
    return {
      categories: NOTIFICATION_TEMPLATE_CATEGORIES,
      variables: SUPPORTED_TEMPLATE_VARIABLES,
      defaults: DEFAULT_NOTIFICATION_TEMPLATES.map((template) => ({
        key: template.key,
        title: template.title,
        category: template.category,
        variables: template.variables,
      })),
    };
  }

  private readMetadata(raw: unknown): NotificationTemplateMetadata {
    if (!raw || typeof raw !== 'object') return { variables: [] };
    const objectLike = raw as Record<string, unknown>;
    if (Array.isArray(raw)) return { variables: raw.map((v) => String(v)) };
    const category = typeof objectLike.category === 'string' ? objectLike.category : undefined;
    const variables = Array.isArray(objectLike.variables)
      ? objectLike.variables.map((item) => String(item))
      : [];
    return { category: category as any, variables };
  }

  private toResponse(template: NotificationTemplateRecord): NotificationTemplateResponse {
    const metadata = this.readMetadata(template.variables);
    return {
      id: template.id,
      key: template.key,
      title: template.title,
      message: template.message,
      active: template.active,
      category: (metadata.category ?? null) as any,
      variables: metadata.variables ?? [],
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };
  }

  private async nextDuplicateSuffix(tenantId: string, key: string): Promise<number> {
    const copies = await this.prisma.notificationTemplate.findMany({
      where: { tenantId, key: { startsWith: `${key}_copy_` } },
      select: { key: true },
    });
    if (copies.length === 0) return 1;
    const nums = copies
      .map((copy) => Number(copy.key.replace(`${key}_copy_`, '')))
      .filter((num) => Number.isFinite(num));
    return (nums.length > 0 ? Math.max(...nums) : 0) + 1;
  }
}

