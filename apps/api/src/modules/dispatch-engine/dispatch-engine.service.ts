import { Injectable } from '@nestjs/common';
import {
  DispatchEnginePatient,
  DispatchEngineVehicle,
  DispatchRouteGroup,
  DispatchVehicleType,
  PATIENT_VEHICLE_COMPATIBILITY,
  PatientPriority,
  PatientRequirement,
  SUPPORTED_VEHICLE_TYPES,
  UnassignedPatient,
} from './dispatch-engine.types';

@Injectable()
export class DispatchEngineService {
  private routeCounter = 0;

  generatePlan(input: {
    patients: Array<{
      id: string;
      name?: string;
      city: string;
      priority?: string;
      bedridden?: boolean;
      wheelchair?: boolean;
    }>;
    vehicles: Array<{
      id: string;
      type: string;
      capacity: number;
      city?: string;
      isPriority?: boolean;
      active?: boolean;
    }>;
  }) {
    const warnings: string[] = [];
    const supportedVehicles = this.normalizeVehicles(input.vehicles ?? [], warnings);
    const patients = this.normalizePatients(input.patients ?? []);
    const remainingCapacity = new Map<string, number>(
      supportedVehicles.map((v) => [v.id, Math.max(0, Math.floor(v.capacity || 0))]),
    );

    const routeGroups: DispatchRouteGroup[] = [];
    const unassigned: UnassignedPatient[] = [];

    const bedridden = patients.filter((p) => p.requirement === 'BEDRIDDEN');
    const wheelchair = patients.filter((p) => p.requirement === 'WHEELCHAIR');
    const standard = patients.filter((p) => p.requirement === 'STANDARD');

    this.assignByRequirement({
      groups: this.groupByCity(bedridden),
      requirement: 'BEDRIDDEN',
      routeRule: 'BEDRIDDEN_TO_AMBULANCE',
      typePreference: ['ADVANCED_AMBULANCE', 'AMBULANCE'],
      vehicles: supportedVehicles,
      remainingCapacity,
      routeGroups,
      unassigned,
      splitIntoCityRoute: false,
    });

    this.assignByRequirement({
      groups: this.groupByCity(wheelchair),
      requirement: 'WHEELCHAIR',
      routeRule: 'WHEELCHAIR_TO_ADAPTED_VAN',
      typePreference: ['ADAPTED_VAN', 'AMBULANCE', 'ADVANCED_AMBULANCE'],
      vehicles: supportedVehicles,
      remainingCapacity,
      routeGroups,
      unassigned,
      splitIntoCityRoute: false,
    });

    this.assignByRequirement({
      groups: this.groupByCity(standard),
      requirement: 'STANDARD',
      routeRule: 'SAME_CITY_TO_VAN_ROUTE',
      typePreference: ['VAN', 'ADAPTED_VAN', 'CAR'],
      vehicles: supportedVehicles,
      remainingCapacity,
      routeGroups,
      unassigned,
      splitIntoCityRoute: true,
    });

    return {
      summary: {
        totalPatients: patients.length,
        assignedPatients: routeGroups.reduce((acc, g) => acc + g.patientIds.length, 0),
        unassignedPatients: unassigned.length,
        routesGenerated: routeGroups.length,
      },
      compatibilityMatrix: PATIENT_VEHICLE_COMPATIBILITY,
      supportedVehicleTypes: SUPPORTED_VEHICLE_TYPES,
      routeGroups,
      unassigned,
      warnings,
    };
  }

  isCompatible(requirement: PatientRequirement, vehicleType: DispatchVehicleType) {
    return PATIENT_VEHICLE_COMPATIBILITY[requirement].includes(vehicleType);
  }

  private assignByRequirement(args: {
    groups: Map<string, DispatchEnginePatient[]>;
    requirement: PatientRequirement;
    routeRule: string;
    typePreference: DispatchVehicleType[];
    vehicles: DispatchEngineVehicle[];
    remainingCapacity: Map<string, number>;
    routeGroups: DispatchRouteGroup[];
    unassigned: UnassignedPatient[];
    splitIntoCityRoute: boolean;
  }) {
    args.groups.forEach((rawPatients, city) => {
      const patients = [...rawPatients].sort((a, b) => this.priorityRank(b.priority) - this.priorityRank(a.priority));
      while (patients.length > 0) {
        const highPriority = patients.some((p) => this.isHighPriority(p.priority));
        const vehicle = this.pickVehicle({
          city,
          requirement: args.requirement,
          highPriority,
          typePreference: args.typePreference,
          vehicles: args.vehicles,
          remainingCapacity: args.remainingCapacity,
        });

        if (!vehicle) {
          patients.forEach((p) =>
            args.unassigned.push({
              patientId: p.id,
              city: p.city,
              requirement: p.requirement,
              reason: `No compatible vehicle available for ${p.requirement}`,
            }),
          );
          break;
        }

        const cap = args.remainingCapacity.get(vehicle.id) ?? 0;
        if (cap <= 0) {
          patients.forEach((p) =>
            args.unassigned.push({
              patientId: p.id,
              city: p.city,
              requirement: p.requirement,
              reason: `Vehicle ${vehicle.id} has no remaining capacity`,
            }),
          );
          break;
        }

        const maxCount = args.splitIntoCityRoute ? cap : Math.min(cap, patients.length);
        const selected = patients.splice(0, maxCount);
        args.remainingCapacity.set(vehicle.id, cap - selected.length);

        const groupPriority = selected.some((p) => this.isHighPriority(p.priority));
        const rulesApplied = [args.routeRule];
        if (groupPriority) rulesApplied.push('HIGH_PRIORITY_TO_PRIORITY_VEHICLE');
        if (args.requirement === 'STANDARD') rulesApplied.push('CITY_GROUPING_ROUTE');

        args.routeGroups.push({
          routeGroupId: this.nextRouteGroupId(),
          city,
          vehicleId: vehicle.id,
          vehicleType: vehicle.type,
          patientIds: selected.map((p) => p.id),
          rulesApplied,
          isPriority: groupPriority,
        });
      }
    });
  }

  private pickVehicle(args: {
    city: string;
    requirement: PatientRequirement;
    highPriority: boolean;
    typePreference: DispatchVehicleType[];
    vehicles: DispatchEngineVehicle[];
    remainingCapacity: Map<string, number>;
  }): DispatchEngineVehicle | null {
    const candidates = args.vehicles.filter((v) => {
      const cap = args.remainingCapacity.get(v.id) ?? 0;
      return cap > 0 && this.isCompatible(args.requirement, v.type);
    });
    if (candidates.length === 0) return null;

    const sorted = [...candidates].sort((a, b) => {
      const scoreA = this.scoreVehicle(a, args);
      const scoreB = this.scoreVehicle(b, args);
      return scoreB - scoreA;
    });
    return sorted[0] ?? null;
  }

  private scoreVehicle(
    vehicle: DispatchEngineVehicle,
    args: {
      city: string;
      highPriority: boolean;
      typePreference: DispatchVehicleType[];
      remainingCapacity: Map<string, number>;
    },
  ) {
    let score = 0;
    const sameCity = vehicle.city && vehicle.city.toUpperCase() === args.city.toUpperCase();
    if (sameCity) score += 30;

    const preferenceIndex = args.typePreference.indexOf(vehicle.type);
    if (preferenceIndex >= 0) score += 100 - preferenceIndex * 10;

    if (args.highPriority && vehicle.isPriority) score += 70;
    if (args.highPriority && ['ADVANCED_AMBULANCE', 'AMBULANCE'].includes(vehicle.type)) score += 40;

    const cap = args.remainingCapacity.get(vehicle.id) ?? 0;
    score += Math.min(cap, 10);
    return score;
  }

  private normalizeVehicles(
    vehicles: Array<{
      id: string;
      type: string;
      capacity: number;
      city?: string;
      isPriority?: boolean;
      active?: boolean;
    }>,
    warnings: string[],
  ): DispatchEngineVehicle[] {
    const normalized: DispatchEngineVehicle[] = [];

    for (const vehicle of vehicles) {
      if (vehicle.active === false) continue;
      const mappedType = this.normalizeVehicleType(vehicle.type);
      if (!mappedType) {
        warnings.push(`Vehicle ${vehicle.id} ignored: unsupported type "${vehicle.type}"`);
        continue;
      }

      normalized.push({
        id: vehicle.id,
        type: mappedType,
        capacity: Math.max(1, Math.floor(vehicle.capacity || 1)),
        city: vehicle.city?.trim() || undefined,
        isPriority: Boolean(vehicle.isPriority),
      });
    }

    return normalized;
  }

  private normalizeVehicleType(type: string): DispatchVehicleType | null {
    const normalized = String(type ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const map: Record<string, DispatchVehicleType> = {
      CAR: 'CAR',
      VAN: 'VAN',
      ADAPTED_VAN: 'ADAPTED_VAN',
      ADAPTED: 'ADAPTED_VAN',
      AMBULANCE: 'AMBULANCE',
      ADVANCED_AMBULANCE: 'ADVANCED_AMBULANCE',
      UTI_AMBULANCE: 'ADVANCED_AMBULANCE',
    };
    return map[normalized] ?? null;
  }

  private normalizePatients(
    patients: Array<{
      id: string;
      name?: string;
      city: string;
      priority?: string;
      bedridden?: boolean;
      wheelchair?: boolean;
    }>,
  ): DispatchEnginePatient[] {
    return patients
      .filter((p) => p?.id && p?.city)
      .map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city.trim(),
        priority: this.normalizePriority(p.priority),
        requirement: p.bedridden ? 'BEDRIDDEN' : p.wheelchair ? 'WHEELCHAIR' : 'STANDARD',
      }));
  }

  private normalizePriority(priority?: string): PatientPriority {
    const normalized = String(priority ?? 'NORMAL').trim().toUpperCase();
    if (['LOW', 'NORMAL', 'HIGH', 'CRITICAL', 'EMERGENCY'].includes(normalized)) {
      return normalized as PatientPriority;
    }
    return 'NORMAL';
  }

  private groupByCity(patients: DispatchEnginePatient[]) {
    const map = new Map<string, DispatchEnginePatient[]>();
    for (const patient of patients) {
      const key = patient.city.toUpperCase();
      const list = map.get(key) ?? [];
      list.push(patient);
      map.set(key, list);
    }
    return map;
  }

  private isHighPriority(priority: PatientPriority) {
    return priority === 'HIGH' || priority === 'CRITICAL' || priority === 'EMERGENCY';
  }

  private priorityRank(priority: PatientPriority) {
    const rank: Record<PatientPriority, number> = {
      LOW: 1,
      NORMAL: 2,
      HIGH: 3,
      CRITICAL: 4,
      EMERGENCY: 5,
    };
    return rank[priority];
  }

  private nextRouteGroupId() {
    this.routeCounter += 1;
    return `RG-${String(this.routeCounter).padStart(4, '0')}`;
  }
}

