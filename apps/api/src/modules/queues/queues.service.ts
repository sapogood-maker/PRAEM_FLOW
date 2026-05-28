import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsGateway } from '../../gateways/operations.gateway';

// SLA limits in minutes per priority
const SLA_MINUTES: Record<string, number> = {
  EMERGENCY: 15,
  CRITICAL: 60,
  HIGH: 60,
  NORMAL: 120,
  LOW: 240,
  PENDING: 240,
};

function calcSlaStatus(createdAt: Date, slaMinutes: number): { slaStatus: string; delayMinutes: number; remainingMinutes: number } {
  const now = Date.now();
  const elapsedMs = now - new Date(createdAt).getTime();
  const elapsedMin = elapsedMs / 60_000;
  const remainingMinutes = Math.max(0, slaMinutes - elapsedMin);
  const delayMinutes = Math.max(0, elapsedMin - slaMinutes);
  const pct = elapsedMin / slaMinutes;
  let slaStatus = 'ON_TIME';
  if (delayMinutes > 0) slaStatus = 'CRITICAL';
  else if (pct >= 0.9) slaStatus = 'DELAYED';
  else if (pct >= 0.75) slaStatus = 'WARNING';
  return { slaStatus, delayMinutes: Math.round(delayMinutes), remainingMinutes: Math.round(remainingMinutes) };
}

// Which timestamp field to set per status
const STATUS_TIMESTAMP: Record<string, string> = {
  CALLED: 'calledAt',
  CONFIRMED: 'confirmedAt',
  CHECKED_IN: 'checkedInAt',
  BOARDING: 'boardedAt',
  DEPARTED: 'departedAt',
  IN_TRANSIT: 'departedAt',
  ARRIVED: 'arrivedAt',
  COMPLETED: 'arrivedAt',
  CANCELLED: 'cancelledAt',
  NO_SHOW: 'noShowAt',
};

@Injectable()
export class QueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly opsGateway: OperationsGateway,
  ) {}

  async findAll(tenantId: string, query: {
    queueType?: string;
    priority?: string;
    status?: string;
    slaStatus?: string;
    confirmationStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const { queueType, priority, status, slaStatus, confirmationStatus, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    // Normalise status: HTTP params can arrive as string or string[]; support
    // comma-separated values like "WAITING,CONFIRMED" too.
    const statusValues: string[] | null = status
      ? (Array.isArray(status) ? status : status.split(','))
          .map((s: string) => s.trim())
          .filter(Boolean)
      : null;
    const where: any = {
      tenantId,
      ...(queueType && { queueType: queueType as any }),
      ...(priority && { priority: priority as any }),
      ...(statusValues && {
        status: statusValues.length === 1
          ? (statusValues[0] as any)
          : { in: statusValues as any[] },
      }),
      ...(slaStatus && { slaStatus: slaStatus as any }),
      ...(confirmationStatus && { confirmationStatus: confirmationStatus as any }),
    };
    const [items, total] = await Promise.all([
      this.prisma.operationalQueue.findMany({
        where,
        skip,
        take: limit,
        include: {
          patient: { select: { id: true, name: true, mobility: true, requiresCompanion: true, clinicalRisk: true } },
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
    const loc = await this.prisma.healthcareLocation.findFirst({
      where: { id: data.healthcareLocationId, tenantId, active: true },
    });
    if (!loc) {
      throw new BadRequestException(
        'Destino médico não encontrado ou inativo. Verifique o destino selecionado.',
      );
    }
    const slaMinutes = SLA_MINUTES[data.priority ?? 'NORMAL'] ?? 120;
    const estimatedDepartureAt = new Date(Date.now() + slaMinutes * 60_000);
    const payload = {
      ...data,
      tenantId,
      destination: loc.name,
      lat: data.lat ?? loc.latitude ?? undefined,
      lng: data.lng ?? loc.longitude ?? undefined,
      slaMinutes,
      estimatedDepartureAt,
      slaStatus: 'ON_TIME',
    };
    const created = await this.prisma.operationalQueue.create({ data: payload });
    this.opsGateway.emitToTenant(tenantId, 'queue.updated', { id: created.id, action: 'CREATED', priority: created.priority });
    return created;
  }

  async updatePriority(id: string, tenantId: string, priority: string) {
    await this.findOne(id, tenantId);
    const slaMinutes = SLA_MINUTES[priority] ?? 120;
    const updated = await this.prisma.operationalQueue.update({
      where: { id },
      data: { priority: priority as any, slaMinutes },
    });
    this.opsGateway.emitToTenant(tenantId, 'queue.priority_changed', { id, priority, slaMinutes });
    return updated;
  }

  async updateStatus(id: string, tenantId: string, status: string, extra?: Record<string, unknown>) {
    const q = await this.findOne(id, tenantId);
    const now = new Date();
    const tsField = STATUS_TIMESTAMP[status];
    const actualWaitMinutes = q.createdAt
      ? Math.round((Date.now() - new Date(q.createdAt).getTime()) / 60_000)
      : undefined;
    const updated = await this.prisma.operationalQueue.update({
      where: { id },
      data: {
        status: status as any,
        ...(tsField && { [tsField]: now }),
        ...(actualWaitMinutes !== undefined && { actualWaitMinutes }),
        ...(extra ?? {}),
      },
    });
    // Emit domain event
    const eventMap: Record<string, string> = {
      CHECKED_IN: 'patient.checked_in',
      BOARDING: 'patient.boarded',
      ARRIVED: 'patient.arrived',
    };
    const event = eventMap[status] ?? 'queue.updated';
    this.opsGateway.emitToTenant(tenantId, event, { id, status, timestamp: now.toISOString(), patientId: q.patientId });
    return updated;
  }

  async markNoShow(id: string, tenantId: string, reason?: string) {
    const q = await this.findOne(id, tenantId);
    const updated = await this.prisma.operationalQueue.update({
      where: { id },
      data: {
        status: 'NO_SHOW',
        noShowAt: new Date(),
        noShowReason: (reason ?? 'UNKNOWN') as any,
      },
    });
    this.opsGateway.emitToTenant(tenantId, 'patient.missed', { id, reason, patientId: q.patientId });
    this.opsGateway.emitAlert(tenantId, { type: 'NO_SHOW', message: `Paciente não encontrado — fila ${id}`, severity: 'warning', data: { id, reason } });
    return updated;
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

  /** Refresh SLA status on a queue item — called periodically or on demand */
  async refreshSla(id: string, tenantId: string) {
    const q = await this.findOne(id, tenantId);
    if (!q.slaMinutes) return q;
    const { slaStatus, delayMinutes, remainingMinutes } = calcSlaStatus(q.createdAt, q.slaMinutes);
    const updated = await this.prisma.operationalQueue.update({
      where: { id },
      data: { slaStatus: slaStatus as any, delayMinutes },
    });
    // Emit alerts when SLA status worsens
    if (slaStatus === 'DELAYED' || slaStatus === 'CRITICAL') {
      const event = slaStatus === 'CRITICAL' ? 'queue.critical' : 'queue.delayed';
      this.opsGateway.emitToTenant(tenantId, event, { id, slaStatus, delayMinutes, remainingMinutes, patientId: q.patientId });
      if (slaStatus === 'CRITICAL') {
        this.opsGateway.emitAlert(tenantId, {
          type: 'SLA_CRITICAL',
          message: `SLA crítico — fila ${id} com ${delayMinutes}min de atraso`,
          severity: 'critical',
          data: { id, delayMinutes },
        });
      }
    } else if (slaStatus === 'WARNING') {
      this.opsGateway.emitToTenant(tenantId, 'queue.sla_warning', { id, slaStatus, remainingMinutes, patientId: q.patientId });
    }
    return { ...updated, remainingMinutes };
  }

  /** Operational metrics for dashboard */
  async metrics(tenantId: string) {
    const now = new Date();
    const [
      totalWaiting,
      slaDelayed,
      slaCritical,
      noShowToday,
      avgWait,
    ] = await Promise.all([
      this.prisma.operationalQueue.count({ where: { tenantId, status: 'WAITING' } }),
      this.prisma.operationalQueue.count({ where: { tenantId, slaStatus: 'DELAYED' } }),
      this.prisma.operationalQueue.count({ where: { tenantId, slaStatus: 'CRITICAL' } }),
      this.prisma.operationalQueue.count({
        where: {
          tenantId,
          status: 'NO_SHOW',
          noShowAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
      }),
      this.prisma.operationalQueue.aggregate({
        where: { tenantId, actualWaitMinutes: { not: null } },
        _avg: { actualWaitMinutes: true },
      }),
    ]);
    return {
      totalWaiting,
      slaDelayed,
      slaCritical,
      noShowToday,
      avgWaitMinutes: Math.round(avgWait._avg.actualWaitMinutes ?? 0),
    };
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

  async aiSuggest(tenantId: string) {
    const queue = await this.prisma.operationalQueue.findMany({
      where: { tenantId, status: { in: ['WAITING', 'ASSIGNED', 'SCHEDULED'] as any[] } },
      include: {
        patient: { select: { id: true, name: true, mobility: true } },
        healthcareLocation: { select: { id: true, name: true } },
      },
      orderBy: [{ appointmentDate: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });

    const byHospitalHour = new Map<string, typeof queue>();
    for (const item of queue) {
      const destinationId = item.healthcareLocationId ?? item.destination ?? 'sem-destino';
      const slot = `${item.appointmentDate.toISOString().slice(0, 10)}-${String(item.appointmentDate.getHours()).padStart(2, '0')}`;
      const key = `${destinationId}:${slot}`;
      const rows = byHospitalHour.get(key) ?? [];
      rows.push(item);
      byHospitalHour.set(key, rows);
    }

    const suggestions: Array<{ type: string; group: string; reason: string; action: string; queueIds?: string[] }> = [];
    for (const [key, rows] of byHospitalHour.entries()) {
      if (rows.length < 2) continue;
      suggestions.push({
        type: 'GROUPING',
        group: rows[0].healthcareLocation?.name ?? rows[0].destination ?? key,
        reason: `${rows.length} pacientes para o mesmo destino e janela de horário`,
        action: 'CREATE_ROUTE',
        queueIds: rows.map((r) => r.id),
      });
    }

    for (const item of queue) {
      if (item.patient?.mobility !== 'WHEELCHAIR') continue;
      suggestions.push({
        type: 'VEHICLE_MATCH',
        group: item.patient?.name ?? item.patientId,
        reason: 'Paciente cadeirante — sugerir veículo adaptado',
        action: 'ASSIGN_VEHICLE',
        queueIds: [item.id],
      });
    }

    for (const item of queue) {
      if (!item.recurrenceType && !String(item.destination ?? '').toUpperCase().includes('HEMODI')) continue;
      suggestions.push({
        type: 'RECURRENCE_BATCH',
        group: item.patient?.name ?? item.patientId,
        reason: 'Operação recorrente detectada — sugerir rota fixa',
        action: 'GROUP_RECURRING',
        queueIds: [item.id],
      });
    }

    return { tenantId, suggestions };
  }
}

