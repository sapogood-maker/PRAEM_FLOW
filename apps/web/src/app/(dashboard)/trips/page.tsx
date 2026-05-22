'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { useRealtimeStore } from '@/store/realtime.store';
import { getTripStatusLabel } from '@/lib/i18n';

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'bg-slate-700 text-slate-300',
  CONFIRMED: 'bg-cyan-900 text-cyan-300',
  BOARDING: 'bg-blue-900 text-blue-300',
  BOARDED: 'bg-blue-900 text-blue-300',
  IN_PROGRESS: 'bg-amber-900 text-amber-300',
  ARRIVED: 'bg-cyan-900 text-cyan-300',
  COMPLETED: 'bg-emerald-900 text-emerald-300',
  NO_SHOW: 'bg-red-900 text-red-300',
  CANCELLED: 'bg-slate-800 text-slate-500',
};

export default function TripsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const boardingEvents = useRealtimeStore((s) => s.boardingEvents);
  const activityFeed = useRealtimeStore((s) => s.activityFeed);
  const connected = useRealtimeStore((s) => s.connected);
  const revision = useRealtimeStore((s) => s.revision);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['trips'] });
  }, [revision, queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ['trips', statusFilter],
    queryFn: () => api.get('/trips', { params: statusFilter ? { status: statusFilter } : {} }).then((r) => r.data),
    refetchInterval: 10000,
  });

  const items = (data?.items ?? []) as any[];
  const total: number = data?.total ?? 0;

  const statuses: { value: string; label: string }[] = [
    { value: '', label: 'Todos os Status' },
    { value: 'SCHEDULED',   label: 'Agendado' },
    { value: 'CONFIRMED',   label: 'Confirmado' },
    { value: 'BOARDING',    label: 'Embarcando' },
    { value: 'IN_PROGRESS', label: 'Em Andamento' },
    { value: 'ARRIVED',     label: 'Chegou' },
    { value: 'COMPLETED',   label: 'Finalizado' },
    { value: 'NO_SHOW',     label: 'Não Compareceu' },
    { value: 'CANCELLED',   label: 'Cancelado' },
  ];

  // Recent boarding events from WebSocket
  const recentBoardings = activityFeed.filter((e) => e.type === 'boarding').slice(0, 5);

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <div className='flex items-center gap-3'>
            <h2 className='text-2xl font-bold text-slate-100'>Viagens do Dia</h2>
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${connected ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
              {connected ? '● AO VIVO' : '○ OFFLINE'}
            </span>
          </div>
          <p className='text-sm text-slate-400'>{total} viagem(ns) registrada(s)</p>
        </div>
        <select
          className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Real-time boarding events feed */}
      {recentBoardings.length > 0 && (
        <div className='rounded-xl border border-blue-800 bg-blue-950/40 p-3'>
          <h3 className='mb-2 text-xs font-semibold uppercase tracking-wider text-blue-400'>Embarques Recentes (Realtime)</h3>
          <ul className='space-y-1'>
            {recentBoardings.map((e) => (
              <li key={e.id} className='flex items-center gap-2 text-sm text-blue-200'>
                <span className='text-blue-400'>→</span>
                <span>{e.message}</span>
                <span className='ml-auto text-xs text-blue-500'>
                  {new Date(e.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-xs text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 text-left'>Paciente</th>
                <th className='p-3 text-left'>Rota</th>
                <th className='p-3 text-left'>Status</th>
                <th className='p-3 text-left'>Embarque</th>
                <th className='p-3 text-left'>QR</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={5} className='p-6 text-center text-slate-500'>Nenhuma viagem encontrada</td></tr>
              )}
              {items.map((t: any) => {
                // Highlight trips that had a recent boarding event
                const hasRecentBoarding = boardingEvents.some((b) => b.tripId === t.id);
                return (
                  <tr key={t.id} className={`border-t border-border transition-colors ${hasRecentBoarding ? 'bg-blue-950/30 hover:bg-blue-950/50' : 'hover:bg-slate-900/40'}`}>
                    <td className='p-3 font-medium'>{t.patient?.name ?? '—'}</td>
                    <td className='p-3 text-xs text-slate-300'>{t.route?.origin ?? '—'} → {t.route?.destination ?? '—'}</td>
                    <td className='p-3'>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? 'text-slate-400'}`}>{getTripStatusLabel(t.status)}</span>
                    </td>
                    <td className='p-3 text-xs text-slate-400'>
                      {t.boardedAt ? new Date(t.boardedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className='p-3 text-center'>{t.qrScanned ? '✅' : '⬜'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
