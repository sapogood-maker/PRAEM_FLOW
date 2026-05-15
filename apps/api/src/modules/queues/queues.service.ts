import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

type QueueItem = {
  id: string;
  tenantId: string;
  patientId: string;
  destination: string;
  appointmentDate: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'PENDING';
  status: 'WAITING' | 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';
  queueType: 'MEDICAL' | 'LOGISTICS';
  confirmationStatus: 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'UNREACHABLE' | 'WAITING_MANUAL_CONFIRMATION';
  requiresCompanion?: boolean;
  recurrenceType?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
};

const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'NORMAL', 'PENDING'];

@Injectable()
export class QueuesService {
  private queue: QueueItem[] = [];

  findAll(queueType?: string) {
    const base = queueType
      ? this.queue.filter((q) => q.queueType === queueType)
      : this.queue;
    return [...base].sort(
      (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
    );
  }

  create(payload: Omit<QueueItem, 'id'>) {
    const item = { ...payload, id: randomUUID() };
    this.queue.push(item);
    return item;
  }

  updatePriority(id: string, priority: QueueItem['priority']) {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return { updated: false };
    item.priority = priority;
    return { updated: true, item };
  }

  updateConfirmation(id: string, status: QueueItem['confirmationStatus'], channel?: string) {
    const item = this.queue.find((q) => q.id === id);
    if (!item) return { updated: false };
    item.confirmationStatus = status;
    return { updated: true, item };
  }

  aiSuggest() {
    const critical = this.queue.filter((q) => q.priority === 'CRITICAL');
    const recurrent = this.queue.filter((q) => q.recurrenceType);
    const companions = this.queue.filter((q) => q.requiresCompanion);

    return {
      suggestions: [
        {
          type: 'GROUPING',
          group: 'Cluster Prioritário',
          queueIds: critical.slice(0, 4).map((q) => q.id),
          reason: 'Pacientes críticos — embarque prioritário imediato',
          action: 'ASSIGN_VEHICLE',
        },
        {
          type: 'RECURRENCE_BATCH',
          group: 'Lote Recorrente',
          queueIds: recurrent.slice(0, 6).map((q) => q.id),
          reason: 'Tratamento recorrente — mesma rota, mesma janela de horário',
          action: 'CREATE_ROUTE',
        },
        {
          type: 'ACCESSIBILITY',
          group: 'Acompanhantes',
          queueIds: companions.slice(0, 3).map((q) => q.id),
          reason: 'Requer acompanhante — considerar capacidade de assento duplo',
          action: 'RESERVE_SEATS',
        },
        {
          type: 'GEOGRAPHIC',
          group: 'Agrupamento Norte',
          queueIds: this.queue.slice(0, 3).map((q) => q.id),
          reason: 'Proximidade geográfica e janela de horário compatível',
          action: 'OPTIMIZE_ROUTE',
        },
      ],
    };
  }
}
