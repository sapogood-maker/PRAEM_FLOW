import { Injectable } from '@nestjs/common';

export interface OperationalKpis {
  // Volume
  patientsToday: number;
  waitingPatients: number;
  criticalPatients: number;
  // Operação
  activeRoutes: number;
  completedTrips: number;
  activeVehicles: number;
  // Qualidade
  averageOccupancy: number;
  absences: number;
  delays: number;
  // Confirmação
  confirmationRate: number;
  absenceRate: number;
  unreachablePatients: number;
  // Eficiência
  estimatedKmToday: number;
  emptyTrips: number;
}

@Injectable()
export class DashboardService {
  kpis(): OperationalKpis {
    return {
      // Volume
      patientsToday: 124,
      waitingPatients: 14,
      criticalPatients: 7,
      // Operação
      activeRoutes: 17,
      completedTrips: 89,
      activeVehicles: 22,
      // Qualidade
      averageOccupancy: 81,
      absences: 5,
      delays: 3,
      // Confirmação
      confirmationRate: 87,
      absenceRate: 4,
      unreachablePatients: 3,
      // Eficiência
      estimatedKmToday: 1240,
      emptyTrips: 2,
    };
  }
}
