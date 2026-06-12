import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OperationShiftService {
  constructor(private readonly prisma: PrismaService) {}

  async findByOperation(operationId: string, tenantId: string) {
    return this.prisma.operationShift.findMany({
      where: { operationId, tenantId },
      orderBy: { startTime: 'asc' },
    });
  }

  async create(tenantId: string, data: { operationId: string; name: string; startTime: string; endTime: string }) {
    return this.prisma.operationShift.create({
      data: { tenantId, ...data, status: 'PENDING' },
    });
  }

  async updateStatus(id: string, tenantId: string, status: string) {
    const shift = await this.prisma.operationShift.findFirst({ where: { id, tenantId } });
    if (!shift) throw new NotFoundException('Shift not found');
    return this.prisma.operationShift.update({ where: { id }, data: { status: status as any } });
  }
}
