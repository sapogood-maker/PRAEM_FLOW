import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthcareLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    query: { search?: string; type?: string; specialty?: string; active?: string; page?: number; limit?: number },
  ) {
    const { search, type, specialty, active, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      ...(type && { type: type as any }),
      ...(active !== undefined && active !== '' && { active: active === 'true' }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { city: { contains: search, mode: 'insensitive' } },
          { district: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(specialty && {
        specialties: { some: { specialty: { contains: specialty, mode: 'insensitive' } } },
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.healthcareLocation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: { specialties: { select: { id: true, specialty: true } } },
      }),
      this.prisma.healthcareLocation.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const loc = await this.prisma.healthcareLocation.findFirst({
      where: { id, tenantId },
      include: { specialties: true },
    });
    if (!loc) throw new NotFoundException('Healthcare location not found');
    return loc;
  }

  async findBySpecialty(tenantId: string, specialty: string) {
    return this.prisma.healthcareLocation.findMany({
      where: {
        tenantId,
        active: true,
        specialties: { some: { specialty: { contains: specialty, mode: 'insensitive' } } },
      },
      include: { specialties: { select: { id: true, specialty: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, data: any) {
    const { specialties, ...rest } = data;
    return this.prisma.healthcareLocation.create({
      data: {
        ...rest,
        tenantId,
        ...(Array.isArray(specialties) && specialties.length > 0
          ? { specialties: { create: specialties.map((s: string) => ({ specialty: s })) } }
          : {}),
      },
      include: { specialties: true },
    });
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const { specialties, ...rest } = data;

    return this.prisma.$transaction(async (tx) => {
      if (Array.isArray(specialties)) {
        await tx.healthcareLocationSpecialty.deleteMany({ where: { healthcareLocationId: id } });
        await tx.healthcareLocationSpecialty.createMany({
          data: specialties.map((s: string) => ({ healthcareLocationId: id, specialty: s })),
        });
      }
      return tx.healthcareLocation.update({
        where: { id },
        data: rest,
        include: { specialties: true },
      });
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.healthcareLocation.delete({ where: { id } });
    return { deleted: true };
  }
}
