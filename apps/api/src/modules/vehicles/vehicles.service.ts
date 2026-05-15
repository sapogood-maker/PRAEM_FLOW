import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: { search?: string; status?: string; type?: string; page?: number; limit?: number }) {
    const { search, status, type, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.VehicleWhereInput = {
      tenantId,
      ...(status && { status: status as any }),
      ...(type && { type: type as any }),
      ...(search && {
        OR: [
          { plate: { contains: search, mode: 'insensitive' } },
          { model: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({ where, skip, take: limit, orderBy: { plate: 'asc' } }),
      this.prisma.vehicle.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const v = await this.prisma.vehicle.findFirst({ where: { id, tenantId } });
    if (!v) throw new NotFoundException('Vehicle not found');
    return v;
  }

  async create(tenantId: string, data: Prisma.VehicleUncheckedCreateInput) {
    return this.prisma.vehicle.create({ data: { ...data, tenantId } });
  }

  async update(id: string, tenantId: string, data: Prisma.VehicleUncheckedUpdateInput) {
    await this.findOne(id, tenantId);
    return this.prisma.vehicle.update({ where: { id }, data });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.vehicle.update({ where: { id }, data: { active: false } });
    return { deleted: true };
  }
}

