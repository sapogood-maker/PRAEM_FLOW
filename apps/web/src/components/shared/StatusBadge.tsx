import { cn } from '@/lib/utils';

export function StatusBadge({ label, active = false }: { label: string; active?: boolean }) {
  return <span className={cn('rounded-full px-3 py-1 text-xs', active ? 'bg-emerald-600/30 text-emerald-300' : 'bg-slate-700 text-slate-300')}>{label}</span>;
}
