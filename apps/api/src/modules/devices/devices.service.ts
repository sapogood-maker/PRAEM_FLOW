import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: { type?: string; active?: boolean; page?: number; limit?: number }) {
    const { type, active, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: any = {
      tenantId,
      ...(type && { type: type as any }),
      ...(active !== undefined && { active }),
    };
    const [items, total] = await Promise.all([
      this.prisma.device.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.device.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const device = await this.prisma.device.findFirst({ where: { id, tenantId } });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  async create(tenantId: string, data: any) {
    const authToken = `dev_${randomUUID().replace(/-/g, '')}`;
    return this.prisma.device.create({
      data: { ...data, tenantId, authToken },
    });
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    return this.prisma.device.update({ where: { id }, data });
  }

  async heartbeat(id: string, tenantId: string, ip?: string, appVersion?: string) {
    await this.findOne(id, tenantId);
    return this.prisma.device.update({
      where: { id },
      data: { lastSeenAt: new Date(), ...(ip && { ipAddress: ip }), ...(appVersion && { appVersion }) },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.device.delete({ where: { id } });
    return { deleted: true };
  }

  /** Authenticate a device by its authToken */
  async authenticateByToken(token: string) {
    const device = await this.prisma.device.findUnique({ where: { authToken: token } });
    if (!device || !device.active) throw new BadRequestException('Device not found or inactive');
    await this.prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: new Date() } });
    return device;
  }
}
