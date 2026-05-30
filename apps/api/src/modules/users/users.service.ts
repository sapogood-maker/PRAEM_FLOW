import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: { search?: string; role?: string; page?: number; limit?: number }) {
    const { search, role, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where = {
      tenantId,
      ...(role && { role: role as any }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: { id: true, name: true, email: true, role: true, phone: true, active: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(tenantId: string, data: { name: string; email: string; password: string; role: string; phone?: string }) {
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email: data.email } });
    if (existing) throw new BadRequestException('Email already registered for this tenant');
    const hashed = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: { tenantId, ...data, password: hashed, role: data.role as any, active: true },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true, createdAt: true },
    });
  }

  async update(id: string, tenantId: string, data: { name?: string; phone?: string; role?: string; active?: boolean }) {
    await this.findOne(id, tenantId);
    return this.prisma.user.update({
      where: { id },
      data: { ...data, ...(data.role && { role: data.role as any }) },
      select: { id: true, name: true, email: true, role: true, phone: true, active: true, createdAt: true },
    });
  }
}
