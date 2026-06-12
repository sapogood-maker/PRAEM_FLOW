interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  accent?: 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';
}

const ACCENT_CLASSES: Record<string, string> = {
  cyan: 'text-cyan-400',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  indigo: 'text-indigo-400',
  slate: 'text-slate-300',
};

export function ReportStatCard({ label, value, subtext, accent = 'cyan' }: StatCardProps) {
  return (
    <div className='rounded-2xl border border-white/5 bg-white/5 px-4 py-4'>
      <p className='text-[10px] uppercase tracking-[0.3em] text-slate-500'>{label}</p>
      <p className={`mt-1 text-2xl font-bold ${ACCENT_CLASSES[accent] ?? 'text-slate-100'}`}>{value}</p>
      {subtext && <p className='mt-1 text-[11px] text-slate-500'>{subtext}</p>}
    </div>
  );
}
