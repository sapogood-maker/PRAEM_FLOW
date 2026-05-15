import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

type DailyOperation = {
  id: string;
  tenantId: string;
  date: string;
  status: 'PLANNING' | 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  totalVehicles: number;
  totalDrivers: number;
  totalPatients: number;
  totalRoutes: number;
  notes?: string;
  createdAt: string;
};

@Injectable()
export class DailyOperationService {
  private operations: DailyOperation[] = [];

  findAll(tenantId: string) {
    return this.operations.filter((o) => o.tenantId === tenantId);
  }

  findToday(tenantId: string) {
    const today = new Date().toISOString().split('T')[0];
    return this.operations.find(
      (o) => o.tenantId === tenantId && o.date.startsWith(today),
    ) ?? this.openToday(tenantId);
  }

  openToday(tenantId: string): DailyOperation {
    const today = new Date().toISOString().split('T')[0];
    const existing = this.operations.find((o) => o.tenantId === tenantId && o.date.startsWith(today));
    if (existing) return existing;
    const op: DailyOperation = {
      id: randomUUID(),
      tenantId,
      date: new Date().toISOString(),
      status: 'PLANNING',
      totalVehicles: 0,
      totalDrivers: 0,
      totalPatients: 0,
      totalRoutes: 0,
      createdAt: new Date().toISOString(),
    };
    this.operations.push(op);
    return op;
  }

  updateStatus(id: string, status: DailyOperation['status']) {
    const op = this.operations.find((o) => o.id === id);
    if (!op) return { updated: false };
    op.status = status;
    return { updated: true, operation: op };
  }
}
