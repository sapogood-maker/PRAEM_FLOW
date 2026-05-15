import { Card } from '@/components/ui/card';

export function KPICard({ title, value }: { title: string; value: string | number }) {
  return (
    <Card>
      <p className='text-sm text-slate-400'>{title}</p>
      <p className='mt-2 text-3xl font-semibold'>{value}</p>
    </Card>
  );
}
