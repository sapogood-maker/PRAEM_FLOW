import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: { search?: string; status?: string; page?: number; limit?: number }) {
    const { search, status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: any = {
      tenantId,
      ...(status && { status: status as any }),
      ...(search && {
        user: { name: { contains: search, mode: 'insensitive' } },
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.driver.findMany({ where, skip, take: limit, include: { user: true }, orderBy: { user: { name: 'asc' } } }),
      this.prisma.driver.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const d = await this.prisma.driver.findFirst({ where: { id, tenantId }, include: { user: true } });
    if (!d) throw new NotFoundException('Driver not found');
    return d;
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    return this.prisma.driver.update({ where: { id }, data });
  }
}

