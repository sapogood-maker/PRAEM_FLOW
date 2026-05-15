import { Injectable } from '@nestjs/common';

@Injectable()
export class DashboardService {
  kpis() {
    return {
      patientsToday: 124,
      activeRoutes: 17,
      averageOccupancy: 81,
      absences: 5,
      delays: 3,
      activeVehicles: 22,
      completedTrips: 89,
      waitingPatients: 14,
    };
  }
}
