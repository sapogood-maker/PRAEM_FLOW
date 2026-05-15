import { Injectable } from '@nestjs/common';
import { sanitizePayload } from '../../common/sanitize';

export type VehicleTrackingPayload = {
  vehicleId: string;
  driverId?: string;
  routeId?: string;
  tenantId: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  ignition?: boolean;
  online?: boolean;
};

@Injectable()
export class TrackingService {
  private state = new Map<string, VehicleTrackingPayload & { updatedAt: string }>();

  update(raw: VehicleTrackingPayload) {
    const payload = sanitizePayload(raw) as VehicleTrackingPayload;
    const current = { ...payload, online: true, updatedAt: new Date().toISOString() };
    this.state.set(payload.vehicleId, current);
    return current;
  }

  vehicles() {
    return Array.from(this.state.values());
  }

  vehicleById(vehicleId: string) {
    return this.state.get(vehicleId) ?? null;
  }
}
