'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { routeService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { getRouteStatusLabel } from '@/lib/i18n';
import { api } from '@/services/api';

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
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['routes', selectedDate],
    queryFn: async () => {
      const [dateScoped, staleCandidates] = await Promise.all([
        routeService.list({ date: selectedDate, limit: 100 }),
        routeService.list({ status: 'DISPATCHED,ACTIVE,RETURNING', limit: 100 }),
      ]);
      const merged = new Map<string, any>();
      for (const item of dateScoped?.items ?? []) merged.set(item.id, item);
      for (const item of staleCandidates?.items ?? []) {
        if (item?.isStale || item?.requiresRecovery) merged.set(item.id, item);
      }
      return {
        ...(dateScoped ?? {}),
        items: [...merged.values()],
        total: [...merged.values()].length,
      };
    },
  });
  const recoveryMutation = useMutation({
    mutationFn: async (routeId: string) => api.post(`/routes/${routeId}/force-complete`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['routes'] });
      void qc.invalidateQueries({ queryKey: ['dashboard', 'kpis'] });
      void qc.invalidateQueries({ queryKey: ['trips'] });
    },
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
                <th className='p-3 text-left'>Estado Operacional</th>
                <th className='p-3 text-left'>Stale Operacional</th>
                <th className='p-3 text-left'>Replay</th>
                <th className='p-3 text-left'>Recuperação</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={11} className='p-6 text-center text-slate-500'>Nenhuma rota para esta data</td></tr>
              )}
              {items.map((r: any) => (
                <tr
                  key={r.id}
                  className={`border-t border-border transition-colors ${
                    r.isStale ? 'bg-amber-950/30 hover:bg-amber-950/40' : 'hover:bg-slate-900/40'
                  }`}
                >
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
                  <td className='p-3'>
                    <span className='rounded px-2 py-0.5 text-xs font-medium bg-slate-800 text-cyan-300'>
                      {getRouteStatusLabel(r.operationalStateDerived ?? r.operationalState ?? r.status)}
                    </span>
                  </td>
                  <td className='p-3'>
                    {r.isStale ? (
                      <div className='space-y-1'>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            r.staleLevel === 'RECOVERY_REQUIRED'
                              ? 'bg-red-900 text-red-300'
                              : r.staleLevel === 'CRITICAL_STALE'
                                ? 'bg-amber-900 text-amber-300'
                                : 'bg-yellow-900 text-yellow-300'
                          }`}
                        >
                          {r.staleLevel === 'RECOVERY_REQUIRED'
                            ? 'RECUPERAÇÃO OBRIGATÓRIA'
                            : r.staleLevel === 'CRITICAL_STALE'
                              ? 'STALE CRÍTICA'
                              : 'STALE'}
                        </span>
                        <p className='text-[11px] text-slate-400'>Tempo decorrido: {r.staleHours ?? r.stalePolicy?.elapsedHours ?? 0}h</p>
                        <p className='text-[11px] text-amber-300'>⚠️ Atenção operacional</p>
                      </div>
                    ) : (
                      <span className='text-xs text-slate-500'>OK</span>
                    )}
                  </td>
                  <td className='p-3'>
                    <Link
                      href={`/replay?routeId=${r.id}`}
                      className='rounded-lg border border-border bg-slate-900 px-2 py-1 text-xs text-cyan-300 hover:text-cyan-200'
                    >
                      Abrir
                    </Link>
                  </td>
                  <td className='p-3'>
                    {r.isStale || ['ACTIVE', 'DISPATCHED', 'RETURNING'].includes(String(r.status)) ? (
                      <button
                        type='button'
                        disabled={recoveryMutation.isPending}
                        onClick={() => recoveryMutation.mutate(r.id)}
                        className='rounded-lg bg-red-900 px-2 py-1 text-xs font-semibold text-red-300 hover:bg-red-800 disabled:opacity-60'
                      >
                        {recoveryMutation.isPending ? 'Finalizando…' : 'Finalizar Operação'}
                      </button>
                    ) : (
                      <span className='text-xs text-slate-500'>—</span>
                    )}
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
