import { Injectable } from '@nestjs/common';

type Tracking = {
  vehicleId: string;
  driverId: string;
  tenantId: string;
  lat: number;
  lng: number;
  updatedAt: string;
};

@Injectable()
export class TrackingService {
  private state = new Map<string, Tracking>();

  update(payload: Omit<Tracking, 'updatedAt'>) {
    const current = { ...payload, updatedAt: new Date().toISOString() };
    this.state.set(payload.vehicleId, current);
    return current;
  }

  vehicles() {
    return Array.from(this.state.values());
  }
}
