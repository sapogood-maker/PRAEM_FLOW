import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

type OperationShift = {
  id: string;
  tenantId: string;
  dailyOperationId: string;
  name: string;
  startTime: string;
  endTime: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
};

@Injectable()
export class OperationShiftService {
  private shifts: OperationShift[] = [];

  findByOperation(dailyOperationId: string) {
    return this.shifts.filter((s) => s.dailyOperationId === dailyOperationId);
  }

  create(payload: Omit<OperationShift, 'id' | 'createdAt'>) {
    const shift: OperationShift = {
      ...payload,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.shifts.push(shift);
    return shift;
  }

  activate(id: string) {
    const shift = this.shifts.find((s) => s.id === id);
    if (!shift) return { updated: false };
    shift.status = 'ACTIVE';
    return { updated: true, shift };
  }

  complete(id: string) {
    const shift = this.shifts.find((s) => s.id === id);
    if (!shift) return { updated: false };
    shift.status = 'COMPLETED';
    return { updated: true, shift };
  }
}
