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
};

const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'NORMAL', 'PENDING'];

@Injectable()
export class QueuesService {
  private queue: QueueItem[] = [];

  findAll() {
    return [...this.queue].sort(
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

  aiSuggest() {
    return {
      suggestions: [
        {
          group: 'Cluster Norte',
          queueIds: this.queue.slice(0, 3).map((q) => q.id),
          reason: 'Proximidade geográfica e janela de horário compatível',
        },
      ],
    };
  }
}
