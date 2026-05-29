export type DispatchVehicleType =
  | 'CAR'
  | 'VAN'
  | 'ADAPTED_VAN'
  | 'AMBULANCE'
  | 'ADVANCED_AMBULANCE';

export type PatientRequirement = 'BEDRIDDEN' | 'WHEELCHAIR' | 'STANDARD';
export type PatientPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | 'EMERGENCY';

export interface DispatchEnginePatient {
  id: string;
  name?: string;
  city: string;
  priority: PatientPriority;
  requirement: PatientRequirement;
}

export interface DispatchEngineVehicle {
  id: string;
  type: DispatchVehicleType;
  capacity: number;
  city?: string;
  isPriority: boolean;
}

export interface DispatchRouteGroup {
  routeGroupId: string;
  city: string;
  vehicleId: string;
  vehicleType: DispatchVehicleType;
  patientIds: string[];
  rulesApplied: string[];
  isPriority: boolean;
}

export interface UnassignedPatient {
  patientId: string;
  city: string;
  requirement: PatientRequirement;
  reason: string;
}

export interface OperationalGroupingInput {
  demandId: string;
  destination: string;
  appointmentTime: string | Date;
  priority: PatientPriority;
  wheelchair: boolean;
  stretcher: boolean;
  returnTrip: boolean;
}

export interface OperationalGroupingSuggestion {
  groupingKey: string;
  destination: string;
  appointmentWindow: string;
  demandIds: string[];
  totalPatients: number;
  wheelchairCount: number;
  stretcherCount: number;
  returnTripCount: number;
  highestPriority: PatientPriority;
  recommendedMinCapacity: number;
}

export const SUPPORTED_VEHICLE_TYPES: DispatchVehicleType[] = [
  'CAR',
  'VAN',
  'ADAPTED_VAN',
  'AMBULANCE',
  'ADVANCED_AMBULANCE',
];

export const PATIENT_VEHICLE_COMPATIBILITY: Record<PatientRequirement, DispatchVehicleType[]> = {
  BEDRIDDEN: ['AMBULANCE', 'ADVANCED_AMBULANCE'],
  WHEELCHAIR: ['ADAPTED_VAN', 'AMBULANCE', 'ADVANCED_AMBULANCE'],
  STANDARD: ['CAR', 'VAN', 'ADAPTED_VAN', 'AMBULANCE', 'ADVANCED_AMBULANCE'],
};
