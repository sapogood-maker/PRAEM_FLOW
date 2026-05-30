import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_TEMPLATES, NotificationTemplateKey } from './whatsapp.types';

@Injectable()
export class WhatsappTemplateService {
  private readonly logger = new Logger(WhatsappTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Returns all templates for a tenant */
  async findAll(tenantId: string) {
    return this.prisma.notificationTemplate.findMany({
      where: { tenantId },
      orderBy: { key: 'asc' },
    });
  }

  /** Returns a single template by ID */
  async findOne(id: string, tenantId: string) {
    const t = await this.prisma.notificationTemplate.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Template não encontrado');
    return t;
  }

  /** Returns an active template by key, or throws */
  async getByKey(tenantId: string, key: NotificationTemplateKey) {
    const t = await this.prisma.notificationTemplate.findFirst({
      where: { tenantId, key, active: true },
    });
    if (!t) {
      this.logger.warn(`[TEMPLATE] Missing template key=${key} tenantId=${tenantId} — using default`);
      return null;
    }
    return t;
  }

  /**
   * Renders a template message by substituting {{variable}} placeholders.
   * Returns the raw default message if no DB template is found.
   */
  async renderMessage(
    tenantId: string,
    key: NotificationTemplateKey,
    variables: Record<string, string> = {},
  ): Promise<{ message: string; templateId: string | null }> {
    const dbTemplate = await this.getByKey(tenantId, key);
    const rawMessage = dbTemplate?.message ?? DEFAULT_TEMPLATES[key]?.message ?? '';
    const templateId = dbTemplate?.id ?? null;

    const message = rawMessage.replace(/\{\{(\w+)\}\}/g, (_match: string, varName: string) => {
      return variables[varName] ?? `{{${varName}}}`;
    });
    this.logger.debug(`[MESSAGE] rendered key=${key} templateId=${templateId}`);
    return { message, templateId };
  }

  /** Creates a new template */
  async create(tenantId: string, data: { key: string; title: string; message: string; variables?: string[] }) {
    this.logger.log(`[TEMPLATE] create key=${data.key} tenantId=${tenantId}`);
    return this.prisma.notificationTemplate.create({
      data: {
        tenantId,
        key: data.key,
        title: data.title,
        message: data.message,
        variables: data.variables ?? [],
        active: true,
      },
    });
  }

  /** Updates an existing template */
  async update(id: string, tenantId: string, data: Partial<{ title: string; message: string; variables: string[]; active: boolean }>) {
    const existing = await this.findOne(id, tenantId);
    this.logger.log(`[TEMPLATE] update id=${existing.id} key=${existing.key}`);
    return this.prisma.notificationTemplate.update({
      where: { id },
      data,
    });
  }

  /** Toggles active state */
  async setActive(id: string, tenantId: string, active: boolean) {
    await this.findOne(id, tenantId);
    return this.prisma.notificationTemplate.update({ where: { id }, data: { active } });
  }

  /**
   * Seeds default templates for a tenant if they don't exist yet.
   * Safe to call repeatedly — only inserts missing keys.
   */
  async seedDefaults(tenantId: string) {
    const keys = Object.keys(DEFAULT_TEMPLATES) as NotificationTemplateKey[];
    let seeded = 0;
    for (const key of keys) {
      const existing = await this.prisma.notificationTemplate.findFirst({ where: { tenantId, key } });
      if (!existing) {
        const def = DEFAULT_TEMPLATES[key];
        await this.prisma.notificationTemplate.create({
          data: { tenantId, key, title: def.title, message: def.message, variables: def.variables, active: true },
        });
        seeded++;
      }
    }
    this.logger.log(`[TEMPLATE] seedDefaults tenantId=${tenantId} seeded=${seeded}/${keys.length}`);
    return { seeded };
  }
}
