import { KPICard } from './KPICard';

export function KPIGrid({ kpis }: { kpis: Record<string, string | number> }) {
  return (
    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
      {Object.entries(kpis).map(([key, value]) => (
        <KPICard key={key} title={key} value={value} />
      ))}
    </div>
  );
}
