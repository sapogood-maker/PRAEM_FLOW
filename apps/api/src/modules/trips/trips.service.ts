import { Injectable } from '@nestjs/common';

type Trip = {
  id: string;
  tenantId: string;
  routeId: string;
  patientId: string;
  status: 'SCHEDULED' | 'CONFIRMED' | 'BOARDED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  qrScanned: boolean;
};

@Injectable()
export class TripsService {
  private trips: Trip[] = [];

  findAll() {
    return this.trips;
  }

  board(id: string) {
    const trip = this.trips.find((item) => item.id === id);
    if (!trip) return { boarded: false };
    trip.status = 'BOARDED';
    trip.qrScanned = true;
    return { boarded: true, trip };
  }

  complete(id: string) {
    const trip = this.trips.find((item) => item.id === id);
    if (!trip) return { completed: false };
    trip.status = 'COMPLETED';
    return { completed: true, trip };
  }
}
