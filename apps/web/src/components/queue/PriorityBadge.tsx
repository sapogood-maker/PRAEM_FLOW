import type { QueuePriority } from '@/types';

const labels = {
  EMERGENCY: '🚨 Emergência',
  CRITICAL: '🔴 Crítico',
  HIGH: '🟠 Alta',
  NORMAL: '🟡 Normal',
  LOW: '🟢 Baixa',
  PENDING: '⚪ Pendente',
} as const;

export function PriorityBadge({ priority }: { priority: QueuePriority }) {
  return <span className='rounded-full bg-slate-800 px-2 py-1 text-xs'>{labels[priority]}</span>;
}
