import type { DispatchQueueItem, QueueAssignment } from '@/store/operationalDispatch.store';

type VehicleOption = { id: string; type?: string | null; model?: string | null; plate?: string | null };

export interface OperationalSuggestion {
  id: string;
  type: 'GROUPING' | 'VEHICLE' | 'RECURRENCE';
  title: string;
  description: string;
  queueIds: string[];
}

function hourBucket(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toISOString().slice(0, 10)}T${String(date.getHours()).padStart(2, '0')}:00`;
}

export function buildOperationalSuggestions(
  items: DispatchQueueItem[],
  vehicles: VehicleOption[],
): { suggestions: OperationalSuggestion[]; assignments: Record<string, Partial<QueueAssignment>> } {
  const suggestions: OperationalSuggestion[] = [];
  const assignments: Record<string, Partial<QueueAssignment>> = {};

  const groupedByHospitalAndHour = new Map<string, DispatchQueueItem[]>();
  for (const item of items) {
    const destinationKey = item.healthcareLocation?.id ?? item.destination ?? 'sem-destino';
    const slot = hourBucket(item.appointmentDate);
    const key = `${destinationKey}::${slot}`;
    const current = groupedByHospitalAndHour.get(key) ?? [];
    current.push(item);
    groupedByHospitalAndHour.set(key, current);
  }

  for (const [key, grouped] of groupedByHospitalAndHour.entries()) {
    if (grouped.length < 2) continue;
    const label = grouped[0]?.healthcareLocation?.name ?? grouped[0]?.destination ?? 'Destino';
    suggestions.push({
      id: `group-${key}`,
      type: 'GROUPING',
      title: `Agrupar ${grouped.length} pacientes`,
      description: `${label} no mesmo horário operacional`,
      queueIds: grouped.map((q) => q.id),
    });
    const groupKey = `auto-${key}`;
    for (const row of grouped) {
      assignments[row.id] = { ...(assignments[row.id] ?? {}), groupKey };
    }
  }

  const adaptedVehicle = vehicles.find((v) => String(v.type ?? '').toUpperCase().includes('ADAPTED'));
  for (const item of items) {
    const mobility = String(item.patient?.mobility ?? '').toUpperCase();
    if (!['WHEELCHAIR', 'STRETCHER'].includes(mobility)) continue;
    const routeLabel = mobility === 'WHEELCHAIR' ? 'paciente cadeirante' : 'paciente em maca';
    suggestions.push({
      id: `vehicle-${item.id}`,
      type: 'VEHICLE',
      title: `Sugerir veículo adaptado`,
      description: `${item.patient?.name ?? item.patientId}: ${routeLabel}`,
      queueIds: [item.id],
    });
    assignments[item.id] = {
      ...(assignments[item.id] ?? {}),
      recommendedVehicleType: 'ADAPTED',
      recommendationReason: routeLabel,
      ...(adaptedVehicle ? { vehicleId: adaptedVehicle.id } : {}),
    };
  }

  for (const item of items) {
    const destination = String(item.healthcareLocation?.name ?? item.destination ?? '').toUpperCase();
    const recurring =
      !!item.notes?.toUpperCase().includes('RECORR') ||
      !!item.recurrenceType ||
      destination.includes('HEMODI');
    if (!recurring) continue;
    suggestions.push({
      id: `recurrence-${item.id}`,
      type: 'RECURRENCE',
      title: 'Paciente recorrente',
      description: `${item.patient?.name ?? item.patientId} com padrão recorrente (sugerir rota fixa)`,
      queueIds: [item.id],
    });
    assignments[item.id] = { ...(assignments[item.id] ?? {}), recurringHint: true };
  }

  return { suggestions, assignments };
}
