export * from '@praem/shared/src';

// ----- Queue ----------------------------------------------------------------
export type QueuePriority = 'EMERGENCY' | 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'PENDING';
export type QueueStatus =
  | 'WAITING'
  | 'CALLED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'BOARDING'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'ASSIGNED'
  | 'SCHEDULED'
  | 'CLOSED';
export type QueueType = 'MEDICAL' | 'LOGISTICS';
export type QueueSlaStatus = 'ON_TIME' | 'WARNING' | 'DELAYED' | 'CRITICAL';
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
  healthcareLocationId?: string | null;
  appointmentDate: string;
  priority: QueuePriority;
  status: QueueStatus;
  queueType: QueueType;
  confirmationStatus: ConfirmationStatus;
  slaStatus?: QueueSlaStatus;
  delayMinutes?: number | null;
  createdAt?: string;
  arrivedAt?: string | null;
  cancelledAt?: string | null;
  noShowAt?: string | null;
  boardedAt?: string | null;
  requiresCompanion?: boolean;
  recurrenceType?: RecurrenceType;
  notes?: string | null;
  patient?: { id: string; name: string; mobility?: string; clinicalRisk?: string };
  healthcareLocation?: {
    id: string;
    name: string;
    city?: string;
    type?: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
}

// ----- Vehicle Tracking -----------------------------------------------------
export interface VehiclePosition {
  vehicleId: string;
  driverId?: string | null;
  driverName?: string | null;
  routeId?: string | null;
  plate?: string;
  vehicleModel?: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  ignition?: boolean;
  online?: boolean;
  operationalStatus?: string;
  updatedAt?: string;
  timestamp?: string;
}

// ----- Activity Feed --------------------------------------------------------
export interface ActivityEvent {
  id: string;
  message: string;
  type: 'route' | 'trip' | 'queue' | 'vehicle' | 'kpi' | 'alert' | 'boarding' | 'ops' | 'replay' | 'recovery' | 'websocket';
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
