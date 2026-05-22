export * from '@praem/shared/src';

// ----- Queue ----------------------------------------------------------------
export type QueuePriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'PENDING';
export type QueueStatus = 'WAITING' | 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';
export type QueueType = 'MEDICAL' | 'LOGISTICS';
export type ConfirmationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELED'
  | 'UNREACHABLE'
  | 'WAITING_MANUAL_CONFIRMATION';
export type ConfirmationChannel = 'TELEGRAM' | 'WHATSAPP' | 'SMS' | 'PHONE_CALL' | 'MANUAL';
export type RecurrenceType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export interface QueueItem {
  id: string;
  patientId: string;
  destination: string;
  appointmentDate: string;
  priority: QueuePriority;
  status: QueueStatus;
  queueType: QueueType;
  confirmationStatus: ConfirmationStatus;
  requiresCompanion?: boolean;
  recurrenceType?: RecurrenceType;
}

// ----- Vehicle Tracking -----------------------------------------------------
export interface VehiclePosition {
  vehicleId: string;
  plate?: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  ignition?: boolean;
  online?: boolean;
  updatedAt?: string;
}

// ----- Activity Feed --------------------------------------------------------
export interface ActivityEvent {
  id: string;
  message: string;
  type: 'route' | 'trip' | 'queue' | 'vehicle' | 'kpi' | 'alert' | 'boarding';
  timestamp: string;
}

// ----- KPIs -----------------------------------------------------------------
export interface OperationalKpis {
  patientsToday: number;
  waitingPatients: number;
  boardedPatients: number;
  inTransitPatients: number;
  arrivedPatients: number;
  criticalPatients: number;
  activeRoutes: number;
  completedTrips: number;
  activeVehicles: number;
  averageOccupancy: number;
  absences: number;
  delays: number;
  confirmationRate: number;
  absenceRate: number;
  unreachablePatients: number;
  estimatedKmToday: number;
  emptyTrips: number;
}
