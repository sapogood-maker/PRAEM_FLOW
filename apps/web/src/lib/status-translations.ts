import { getStatusLabel } from '@/lib/i18n';

const STATUS_PT_BR: Record<string, string> = {
  CREATED: 'Criada',
  DISPATCHED: 'Despachada',
  ACTIVE: 'Em Operação',
  BOARDING: 'Embarque',
  BOARDED: 'Embarcado',
  IN_TRANSIT: 'Em Trânsito',
  COMPLETED: 'Concluída',
  NO_SHOW: 'Não Compareceu',
  CANCELLED: 'Cancelada',
  SCHEDULED: 'Agendada',
  STOPPED: 'Parado',
  MOVING: 'Em Movimento',
  ONLINE: 'Online',
  OFFLINE: 'Offline',
};

export function translateStatus(status?: string | null): string {
  const raw = String(status ?? '').trim();
  if (!raw) return '—';
  const normalized = raw.toUpperCase();
  return STATUS_PT_BR[normalized] ?? getStatusLabel(normalized) ?? raw;
}
