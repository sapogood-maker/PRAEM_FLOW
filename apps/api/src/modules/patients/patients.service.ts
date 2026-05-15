import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ListPatientsQuery {
  tenantId: string;
  search?: string;
  clinicalRisk?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list({ tenantId, search, clinicalRisk, page = 1, limit = 20 }: ListPatientsQuery) {
    const skip = (page - 1) * limit;
    const where: any = {
      tenantId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { cpf: { contains: search } },
        ],
      }),
      ...(clinicalRisk && { clinicalRisk: clinicalRisk as any }),
    };

    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.patient.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id, tenantId } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async create(tenantId: string, data: any) {
    const existing = await this.prisma.patient.findFirst({
      where: { tenantId, cpf: data.cpf },
    });
    if (existing) throw new BadRequestException('CPF already registered for this tenant');

    return this.prisma.patient.create({
      data: { ...data, tenantId, operationalId: `OP-${Date.now()}` },
    });
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    return this.prisma.patient.update({ where: { id }, data });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.patient.delete({ where: { id } });
    return { deleted: true };
  }

  async qr(id: string, tenantId: string) {
    const patient = await this.findOne(id, tenantId);
    if (!patient.qrCode) {
      await this.prisma.patient.update({
        where: { id },
        data: { qrCode: `PRAEM-${patient.cpf.replace(/\D/g, '')}` },
      });
    }
    const updated = await this.prisma.patient.findUnique({ where: { id } });
    return { patientId: id, qrCode: updated!.qrCode };
  }

  async scan(tenantId: string, payload: { qrCode?: string; cpf?: string }) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        tenantId,
        ...(payload.qrCode ? { qrCode: payload.qrCode } : {}),
        ...(payload.cpf ? { cpf: payload.cpf } : {}),
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return { valid: true, patient };
  }
}


