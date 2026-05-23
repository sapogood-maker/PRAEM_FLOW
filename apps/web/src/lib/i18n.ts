/**
 * Camada de localização PT-BR para o PRAEM OPS.
 * Enums internos do backend permanecem em inglês — a tradução ocorre apenas na UI.
 */

// ── Status de Viagem (TripStatus) ─────────────────────────────────────────────

export const TRIP_STATUS_LABEL: Record<string, string> = {
  SCHEDULED:   'Agendado',
  CONFIRMED:   'Confirmado',
  BOARDING:    'Embarcando',
  BOARDED:     'EMBARCADO',
  IN_TRANSIT:  'EM DESLOCAMENTO',
  IN_PROGRESS: 'EM DESLOCAMENTO',
  ARRIVED:     'Chegou',
  COMPLETED:   'Finalizado',
  NO_SHOW:     'Não Compareceu',
  CANCELLED:   'Cancelado',
};

export function getTripStatusLabel(status: string): string {
  return TRIP_STATUS_LABEL[status] ?? status;
}

// ── Status de Rota (RouteStatus) ──────────────────────────────────────────────

export const ROUTE_STATUS_LABEL: Record<string, string> = {
  SCHEDULED:             'Agendado',
  PENDING:               'Pendente',
  PLANNED:               'Planejado',
  PREPARING:             'Preparando',
  DISPATCHED:            'Despachado',
  ACTIVE:                'Em Viagem',
  WAITING_CONSULTATION:  'Aguardando Consulta',
  RETURNING:             'Retornando',
  COMPLETED:             'Finalizado',
  CANCELLED:             'Cancelado',
  PASSENGERS_ONBOARD:    'PASSAGEIROS EMBARCADOS',
};

export function getRouteStatusLabel(status: string): string {
  return ROUTE_STATUS_LABEL[status] ?? status;
}

// ── Status de Despacho (DispatchStatus) ───────────────────────────────────────
// Separado do QueueStatus e do ConnectionStatus.

export const DISPATCH_STATUS_LABEL: Record<string, string> = {
  PENDING_DISPATCH: 'Aguardando Despacho',
  SCHEDULED:        'Agendado',
  ASSIGNED:         'Atribuído',
  DISPATCHED:       'Motorista a Caminho',
  BOARDING:         'Embarcando',
  ACTIVE:           'Em Viagem',
  RETURNING:        'Retornando',
  COMPLETED:        'Finalizado',
  CANCELLED:        'Cancelado',
};

export function getDispatchStatusLabel(status: string): string {
  return DISPATCH_STATUS_LABEL[status] ?? status;
}

// ── Status de Conexão (ConnectionStatus) ──────────────────────────────────────

export const CONNECTION_STATUS_LABEL: Record<string, string> = {
  ONLINE:  '● Online',
  OFFLINE: '○ Offline',
  IDLE:    '◌ Inativo',
};

// ── Status de Fila (QueueStatus) ─────────────────────────────────────────────
// Fila hospitalar — separado do DispatchStatus e ConnectionStatus.

export const QUEUE_STATUS_LABEL: Record<string, string> = {
  WAITING:    'Aguardando',
  CALLED:     'Chamado',
  CONFIRMED:  'Confirmado',
  NO_SHOW:    'Não Compareceu',
  CANCELLED:  'Cancelado',
  // Valores legados mantidos para compatibilidade
  ASSIGNED:   'Atribuído',
  SCHEDULED:  'Agendado',
  CHECKED_IN: 'Check-in Feito',
  BOARDING:   'Embarcando',
  IN_TRANSIT: 'EM DESLOCAMENTO',
  ARRIVED:    'Chegou',
  COMPLETED:  'Finalizado',
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

export function getConnectionStatusLabel(connected: boolean | string): string {
  if (typeof connected === 'string') {
    return CONNECTION_STATUS_LABEL[connected] ?? connected;
  }
  return connected ? CONNECTION_STATUS_LABEL.ONLINE : CONNECTION_STATUS_LABEL.OFFLINE;
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

// ── Status do Veículo (VehicleStatus) ─────────────────────────────────────────

export const VEHICLE_STATUS_LABEL: Record<string, string> = {
  AVAILABLE:   'Disponível',
  ON_ROUTE:    'Em Rota',
  MAINTENANCE: 'Em Manutenção',
  INACTIVE:    'Inativo',
};

export function getVehicleStatusLabel(status: string): string {
  return VEHICLE_STATUS_LABEL[status] ?? status;
}

// ── Tipo de Veículo (VehicleType) ─────────────────────────────────────────────

export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  VAN:         'Van',
  BUS:         'Ônibus',
  CAR:         'Carro',
  AMBULANCE:   'Ambulância',
  MINIBUS:     'Micro-ônibus',
  WHEELCHAIR_VAN: 'Van Adaptada',
};

export function getVehicleTypeLabel(type: string): string {
  return VEHICLE_TYPE_LABEL[type] ?? type;
}

// ── Status da Operação Diária (DailyOperationStatus) ─────────────────────────

export const OPERATION_STATUS_LABEL: Record<string, string> = {
  PLANNING:  'Planejamento',
  ACTIVE:    'Ativa',
  CLOSED:    'Encerrada',
  CANCELLED: 'Cancelada',
};

export function getOperationStatusLabel(status: string): string {
  return OPERATION_STATUS_LABEL[status] ?? status;
}

// ── Helper genérico ───────────────────────────────────────────────────────────
// Tenta encontrar o label em qualquer mapa conhecido; cai de volta ao enum bruto.

export function getStatusLabel(status: string): string {
  return (
    TRIP_STATUS_LABEL[status] ??
    ROUTE_STATUS_LABEL[status] ??
    DISPATCH_STATUS_LABEL[status] ??
    QUEUE_STATUS_LABEL[status] ??
    DRIVER_STATUS_LABEL[status] ??
    VEHICLE_STATUS_LABEL[status] ??
    OPERATION_STATUS_LABEL[status] ??
    status
  );
}

// ── Tipo de Token de Viagem ───────────────────────────────────────────────────

export const TRIP_TOKEN_TYPE_LABEL: Record<string, string> = {
  CONFIRMATION: 'Confirmação',
  BOARDING:     'Embarque',
  RETURN:       'Retorno',
  REBOOK:       'Reagendamento',
};

export function getTripTokenTypeLabel(type: string): string {
  return TRIP_TOKEN_TYPE_LABEL[type] ?? type;
}
