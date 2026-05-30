export type QueuePriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'PENDING';

export interface DashboardKpis {
  patientsToday: number;
  activeRoutes: number;
  averageOccupancy: number;
  absences: number;
  delays: number;
  activeVehicles: number;
  completedTrips: number;
  waitingPatients: number;
}
