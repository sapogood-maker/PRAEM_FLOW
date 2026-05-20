/**
 * Camada de localização PT-BR para o PRAEM OPS.
 * Enums internos do backend permanecem em inglês — a tradução ocorre apenas na UI.
 */

// ── Status de Viagem (TripStatus) ─────────────────────────────────────────────

export const TRIP_STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  BOARDING:    'Embarcando',
  BOARDED:     'Embarcado',
  IN_PROGRESS: 'Em Andamento',
  COMPLETED:   'Finalizado',
  NO_SHOW:     'Não Compareceu',
  CANCELLED:   'Cancelado',
};

export function getTripStatusLabel(status: string): string {
  return TRIP_STATUS_LABEL[status] ?? status;
}

// ── Status de Rota (RouteStatus) ──────────────────────────────────────────────

export const ROUTE_STATUS_LABEL: Record<string, string> = {
  SCHEDULED:  'Agendado',
  PENDING:    'Pendente',
  PLANNED:    'Planejado',
  PREPARING:  'Preparando',
  DISPATCHED: 'Despachado',
  ACTIVE:     'Ativo',
  COMPLETED:  'Finalizado',
  CANCELLED:  'Cancelado',
};

export function getRouteStatusLabel(status: string): string {
  return ROUTE_STATUS_LABEL[status] ?? status;
}

// ── Status de Fila (QueueStatus) ─────────────────────────────────────────────

export const QUEUE_STATUS_LABEL: Record<string, string> = {
  WAITING:   'Aguardando',
  CALLED:    'Chamado',
  CONFIRMED: 'Confirmado',
  ASSIGNED:  'Atribuído',
  SCHEDULED: 'Agendado',
  CANCELLED: 'Cancelado',
  DISPATCHED:'Despachado',
  ACTIVE:    'Ativo',
  PLANNED:   'Planejado',
};

export function getQueueStatusLabel(status: string): string {
  return QUEUE_STATUS_LABEL[status] ?? status;
}

// ── Status de Confirmação (ConfirmationStatus) ────────────────────────────────

export const CONFIRMATION_STATUS_LABEL: Record<string, string> = {
  CONFIRMED:                    'Confirmado',
  PENDING:                      'Pendente',
  CANCELED:                     'Cancelado',
  UNREACHABLE:                  'Sem Contato',
  WAITING_MANUAL_CONFIRMATION:  'Aguardando Confirmação',
};

export function getConfirmationStatusLabel(status: string): string {
  return CONFIRMATION_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

// ── Prioridade ────────────────────────────────────────────────────────────────

export const PRIORITY_LABEL: Record<string, string> = {
  EMERGENCY: '🚨 Emergência',
  CRITICAL:  'Crítica',
  HIGH:      'Alta',
  NORMAL:    'Normal',
  LOW:       'Baixa',
  PENDING:   'Pendente',
};

export function getPriorityLabel(priority: string): string {
  return PRIORITY_LABEL[priority] ?? priority;
}

// ── Status do Motorista (DriverStatus) ───────────────────────────────────────

export const DRIVER_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Disponível',
  ON_ROUTE:  'Em Rota',
  REST:      'Descanso',
  OFFLINE:   'Offline',
};

export function getDriverStatusLabel(status: string): string {
  return DRIVER_STATUS_LABEL[status] ?? status;
}

// ── Status Operacional do Motorista ─────────────────────────────────────────

export const OPERATIONAL_STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: 'Operacional',
  CONNECTED:   'Conectado',
  GPS_LOST:    'GPS Perdido',
  WS_ONLY:     'Somente WS',
  OFFLINE:     'Offline',
};

export function getOperationalStatusLabel(status: string): string {
  return OPERATIONAL_STATUS_LABEL[status] ?? status;
}

// ── Status de Conexão ─────────────────────────────────────────────────────────

export function getConnectionStatusLabel(connected: boolean): string {
  return connected ? '● AO VIVO' : '○ OFFLINE';
}

// ── Tipo de Despacho ──────────────────────────────────────────────────────────

export const DISPATCH_TYPE_LABEL: Record<string, string> = {
  IMMEDIATE: 'Imediato',
  SCHEDULED: 'Agendado',
};

export function getDispatchTypeLabel(type: string): string {
  return DISPATCH_TYPE_LABEL[type] ?? type;
}

// ── Tipo de Estabelecimento ───────────────────────────────────────────────────

export const HEALTHCARE_TYPE_LABEL: Record<string, string> = {
  HOSPITAL:         '🏥 Hospital',
  CLINIC:           '🏨 Clínica',
  LAB:              '🔬 Laboratório',
  UBS:              '🩺 UBS',
  SPECIALTY_CENTER: '⚕️ Centro Especializado',
  HEMODIALYSIS:     '💉 Hemodiálise',
  ONCOLOGY_CENTER:  '🎗️ Centro de Oncologia',
};

export function getHealthcareTypeLabel(type: string): string {
  return HEALTHCARE_TYPE_LABEL[type] ?? type;
}

// ── Mobilidade ────────────────────────────────────────────────────────────────

export const MOBILITY_LABEL: Record<string, string> = {
  NORMAL:     '🚶 Deambulando',
  WHEELCHAIR: '♿ Cadeirante',
  STRETCHER:  '🛏 Maca',
  OXYGEN:     '💨 Oxigênio',
};

export function getMobilityLabel(mobility: string): string {
  return MOBILITY_LABEL[mobility] ?? mobility;
}

// ── Tipo de Fila ─────────────────────────────────────────────────────────────

export const QUEUE_TYPE_LABEL: Record<string, string> = {
  LOGISTICS: 'Logística',
  MEDICAL:   'Médica',
};

export function getQueueTypeLabel(type: string): string {
  return QUEUE_TYPE_LABEL[type] ?? type;
}
