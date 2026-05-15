const labels = {
  CRITICAL: '🔴 Crítico',
  HIGH: '🟠 Alta',
  NORMAL: '🟡 Normal',
  PENDING: '⚪ Pendente',
} as const;

export function PriorityBadge({ priority }: { priority: keyof typeof labels }) {
  return <span className='rounded-full bg-slate-800 px-2 py-1 text-xs'>{labels[priority]}</span>;
}
