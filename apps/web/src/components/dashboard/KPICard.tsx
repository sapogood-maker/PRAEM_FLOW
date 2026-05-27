import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  accent?: 'default' | 'critical' | 'warning' | 'ok' | 'info';
  icon?: ReactNode;
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
      <div className='flex items-start justify-between gap-4'>
        <div>
          <p className='text-[11px] uppercase tracking-[0.32em] text-slate-500'>{title}</p>
          <p className={`mt-2 text-3xl font-semibold tabular-nums text-slate-100 ${accentStyles[accent] ?? accentStyles.default}`}>
            {value}
            {unit && <span className='ml-1 text-base font-normal text-slate-400'>{unit}</span>}
          </p>
        </div>
        {icon && (
          <span className='flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-lg text-slate-200 ring-1 ring-white/5'>
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}
