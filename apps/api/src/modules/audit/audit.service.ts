import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: { entity?: string; userId?: string; page?: number; limit?: number }) {
    const { entity, userId, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;
    const where = {
      tenantId,
      ...(entity && { entity }),
      ...(userId && { userId }),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async log(data: {
    tenantId: string;
    userId: string;
    action: string;
    entity: string;
    entityId: string;
    before?: object;
    after?: object;
    ip?: string;
  }) {
    return this.prisma.auditLog.create({ data: { ...data, before: data.before as any, after: data.after as any } });
  }
}
