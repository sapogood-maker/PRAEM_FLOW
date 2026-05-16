import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: {
    queueType?: string;
    priority?: string;
    status?: string;
    confirmationStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const { queueType, priority, status, confirmationStatus, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: any = {
      tenantId,
      ...(queueType && { queueType: queueType as any }),
      ...(priority && { priority: priority as any }),
      ...(status && { status: status as any }),
      ...(confirmationStatus && { confirmationStatus: confirmationStatus as any }),
    };
    const [items, total] = await Promise.all([
      this.prisma.operationalQueue.findMany({
        where,
        skip,
        take: limit,
        include: {
          patient: { select: { id: true, name: true, requiresCompanion: true, clinicalRisk: true } },
          healthcareLocation: { select: { id: true, name: true, type: true, city: true, address: true, latitude: true, longitude: true, specialties: { select: { specialty: true } } } },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.operationalQueue.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async create(tenantId: string, data: any) {
    if (!data.healthcareLocationId) {
      throw new BadRequestException(
        'healthcareLocationId é obrigatório. Selecione um destino médico cadastrado.',
      );
    }
    // Validate the location exists and is active for this tenant
    const loc = await this.prisma.healthcareLocation.findFirst({
      where: { id: data.healthcareLocationId, tenantId, active: true },
    });
    if (!loc) {
      throw new BadRequestException(
        'Destino médico não encontrado ou inativo. Verifique o destino selecionado.',
      );
    }
    // Auto-populate destination text and coordinates from the registered location
    const payload = {
      ...data,
      tenantId,
      destination: loc.name,
      lat: data.lat ?? loc.latitude ?? undefined,
      lng: data.lng ?? loc.longitude ?? undefined,
    };
    return this.prisma.operationalQueue.create({ data: payload });
  }

  async updatePriority(id: string, tenantId: string, priority: string) {
    await this.findOne(id, tenantId);
    return this.prisma.operationalQueue.update({ where: { id }, data: { priority: priority as any } });
  }

  async updateConfirmation(id: string, tenantId: string, confirmationStatus: string, channel?: string) {
    await this.findOne(id, tenantId);
    return this.prisma.operationalQueue.update({
      where: { id },
      data: {
        confirmationStatus: confirmationStatus as any,
        ...(channel && { confirmationChannel: channel as any }),
        ...(confirmationStatus === 'CONFIRMED' && { confirmedAt: new Date() }),
        confirmationAttempts: { increment: 1 },
        lastContactAt: new Date(),
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const q = await this.prisma.operationalQueue.findFirst({ where: { id, tenantId } });
    if (!q) throw new NotFoundException('Queue item not found');
    return q;
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.operationalQueue.delete({ where: { id } });
    return { deleted: true };
  }

  aiSuggest(tenantId: string) {
    return {
      suggestions: [
        {
          type: 'GROUPING',
          group: 'Cluster Prioritário',
          reason: 'Pacientes críticos — embarque prioritário imediato',
          action: 'ASSIGN_VEHICLE',
        },
        {
          type: 'RECURRENCE_BATCH',
          group: 'Lote Recorrente',
          reason: 'Tratamento recorrente — mesma rota, mesma janela de horário',
          action: 'CREATE_ROUTE',
        },
      ],
      tenantId,
    };
  }
}

