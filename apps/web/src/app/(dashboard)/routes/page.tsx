'use client';

import { useQuery } from '@tanstack/react-query';
import { routeService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const STATUS_BADGE: Record<string, string> = {
  PLANNED: 'bg-slate-800 text-slate-300',
  ACTIVE: 'bg-cyan-900 text-cyan-300',
  COMPLETED: 'bg-emerald-900 text-emerald-300',
  CANCELLED: 'bg-red-900 text-red-300',
};

export default function RoutesPage() {
  const today = new Date().toISOString().split('T')[0];

  const { data, isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => routeService.list({ date: today, limit: 50 }),
  });

  const items = data?.items ?? [];

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Rotas do Dia</h2>
          <p className='text-sm text-slate-400'>{data?.total ?? 0} rota(s) para hoje</p>
        </div>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-xs text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 text-left'>Origem</th>
                <th className='p-3 text-left'>Destino</th>
                <th className='p-3 text-left'>Motorista</th>
                <th className='p-3 text-left'>Veículo</th>
                <th className='p-3 text-left'>Pacientes</th>
                <th className='p-3 text-left'>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6} className='p-6 text-center text-slate-500'>Nenhuma rota para hoje</td></tr>
              )}
              {items.map((r: any) => (
                <tr key={r.id} className='border-t border-border hover:bg-slate-900/40 transition-colors'>
                  <td className='p-3 max-w-[140px] truncate'>{r.origin}</td>
                  <td className='p-3 max-w-[140px] truncate'>{r.destination}</td>
                  <td className='p-3'>{r.driver?.user?.name ?? '—'}</td>
                  <td className='p-3 font-mono text-xs'>{r.vehicle?.plate ?? '—'}</td>
                  <td className='p-3 text-center'>{r.trips?.length ?? 0}</td>
                  <td className='p-3'>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? 'text-slate-400'}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

