import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, city: true, state: true, active: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, city: true, state: true, cnpj: true, active: true, createdAt: true },
    });
    if (!t) throw new NotFoundException('Tenant not found');
    return t;
  }
}
