import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DailyOperationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.dailyOperation.findMany({
      where: { tenantId },
      include: { shifts: true },
      orderBy: { date: 'desc' },
      take: 30,
    });
  }

  async findToday(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await this.prisma.dailyOperation.findFirst({
      where: { tenantId, date: today },
      include: { shifts: true },
    });
    if (existing) return existing;
    // auto-create if not found
    return this.prisma.dailyOperation.create({
      data: { tenantId, date: today, status: 'PLANNING' },
      include: { shifts: true },
    });
  }

  async create(tenantId: string, data: { date: string; notes?: string }) {
    const date = new Date(data.date);
    date.setHours(0, 0, 0, 0);
    return this.prisma.dailyOperation.create({
      data: { tenantId, date, notes: data.notes, status: 'PLANNING' },
      include: { shifts: true },
    });
  }

  async updateStatus(id: string, tenantId: string, status: string) {
    const op = await this.prisma.dailyOperation.findFirst({ where: { id, tenantId } });
    if (!op) throw new NotFoundException('DailyOperation not found');
    return this.prisma.dailyOperation.update({ where: { id }, data: { status: status as any } });
  }
}
