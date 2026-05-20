'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { routeService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { getRouteStatusLabel } from '@/lib/i18n';

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'bg-indigo-900 text-indigo-300',
  PENDING: 'bg-slate-800 text-slate-400',
  PLANNED: 'bg-slate-800 text-slate-300',
  PREPARING: 'bg-amber-900 text-amber-300',
  DISPATCHED: 'bg-cyan-900 text-cyan-300',
  ACTIVE: 'bg-emerald-900 text-emerald-300',
  COMPLETED: 'bg-emerald-950 text-emerald-500',
  CANCELLED: 'bg-red-900 text-red-300',
};

export default function RoutesPage() {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ['routes', selectedDate],
    queryFn: () => routeService.list({ date: selectedDate, limit: 100 }),
  });

  const items = data?.items ?? [];

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between flex-wrap gap-3'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Rotas</h2>
          <p className='text-sm text-slate-400'>{data?.total ?? 0} rota(s) para a data selecionada</p>
        </div>
        <div className='flex items-center gap-2'>
          <label className='text-xs text-slate-400 uppercase tracking-wider'>Data</label>
          <input
            type='date'
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          />
          <button
            type='button'
            onClick={() => setSelectedDate(today)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-400 hover:text-slate-100 transition-colors'
          >
            Hoje
          </button>
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
                <th className='p-3 text-left'>Agendado</th>
                <th className='p-3 text-left'>Pacientes</th>
                <th className='p-3 text-left'>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className='p-6 text-center text-slate-500'>Nenhuma rota para esta data</td></tr>
              )}
              {items.map((r: any) => (
                <tr key={r.id} className='border-t border-border hover:bg-slate-900/40 transition-colors'>
                  <td className='p-3 max-w-[140px] truncate'>{r.origin}</td>
                  <td className='p-3 max-w-[140px] truncate'>{r.destination}</td>
                  <td className='p-3'>{r.driver?.user?.name ?? <span className='text-slate-500 text-xs'>a atribuir</span>}</td>
                  <td className='p-3 font-mono text-xs'>{r.vehicle?.plate ?? <span className='text-slate-500'>—</span>}</td>
                  <td className='p-3 text-xs text-slate-400'>
                    {r.scheduledAt
                      ? new Date(r.scheduledAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </td>
                  <td className='p-3 text-center'>{r.trips?.length ?? 0}</td>
                  <td className='p-3'>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? 'text-slate-400'}`}>{getRouteStatusLabel(r.status)}</span>
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


