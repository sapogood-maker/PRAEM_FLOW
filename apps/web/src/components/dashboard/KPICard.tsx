import { Card } from '@/components/ui/card';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  accent?: 'default' | 'critical' | 'warning' | 'ok' | 'info';
  icon?: string;
}

const accentStyles: Record<string, string> = {
  default: 'text-slate-100',
  critical: 'text-red-400',
  warning: 'text-amber-400',
  ok: 'text-emerald-400',
  info: 'text-cyan-400',
};

export function KPICard({ title, value, unit, accent = 'default', icon }: KPICardProps) {
  return (
    <Card>
      <div className='flex items-start justify-between'>
        <p className='text-xs text-slate-400 uppercase tracking-wider'>{title}</p>
        {icon && <span className='text-lg'>{icon}</span>}
      </div>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${accentStyles[accent] ?? accentStyles.default}`}>
        {value}
        {unit && <span className='ml-1 text-base font-normal text-slate-400'>{unit}</span>}
      </p>
    </Card>
  );
}
