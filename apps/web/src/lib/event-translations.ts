import { translateStatus } from '@/lib/status-translations';

const EVENT_PT_BR: Record<string, string> = {
  STATE_TRANSITION: 'Transição de Estado',
  RECOVERY_ACTION: 'Ação de Recuperação',
  TRACKING_ARCHIVED_ON_FINALIZE: 'Rastreamento Arquivado na Finalização',
  RECOVERY_ROUTE_FINALIZED: 'Rota finalizada por recuperação',
  RECOVERY_STALE_ROUTE: 'Recuperação de rota desatualizada',
  RECOVERY: 'Ação de Recuperação',
  OPERATION_EVENT: 'Evento Operacional',
  OPERATION_IMPORTED: 'Operação importada',
  OPERATION_CREATED: 'Operação criada',
  OPERATION_DISPATCHED: 'Operação despachada',
  DRIVER_ASSIGNED: 'Motorista atribuído',
  VEHICLE_ASSIGNED: 'Veículo atribuído',
  PATIENT_CONFIRMED: 'Paciente confirmado',
  QUEUE_CREATED: 'Fila criada',
  GPS_CHECKPOINT: 'Ponto de controle de GPS',
  ROUTE_ACCEPTED: 'Rota aceita',
  TRIP_BOARDED: 'Embarque confirmado',
  TRIP_STARTED: 'Viagem iniciada',
  TRIP_ARRIVED: 'Viagem chegou ao destino',
  TRIP_COMPLETED: 'Viagem concluída',
  TRIP_NO_SHOW: 'Não Compareceu',
};

export function translateEventType(eventType?: string | null): string {
  const raw = String(eventType ?? '').trim();
  if (!raw) return 'Evento Operacional';
  const normalized = raw.toUpperCase();
  return EVENT_PT_BR[normalized] ?? normalized.replace(/_/g, ' ').toLowerCase();
}

export function formatStateTransition(fromState?: string | null, toState?: string | null): string {
  const fromLabel = translateStatus(fromState);
  const toLabel = translateStatus(toState);
  return `${fromLabel} → ${toLabel}`;
}
