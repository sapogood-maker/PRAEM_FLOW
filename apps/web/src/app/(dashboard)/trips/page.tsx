'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'bg-slate-700 text-slate-300',
  CONFIRMED: 'bg-cyan-900 text-cyan-300',
  BOARDED: 'bg-blue-900 text-blue-300',
  IN_PROGRESS: 'bg-amber-900 text-amber-300',
  COMPLETED: 'bg-emerald-900 text-emerald-300',
  NO_SHOW: 'bg-red-900 text-red-300',
  CANCELLED: 'bg-slate-800 text-slate-500',
};

export default function TripsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['trips', statusFilter],
    queryFn: () => api.get('/trips', { params: statusFilter ? { status: statusFilter } : {} }).then((r) => r.data),
    refetchInterval: 15000,
  });

  const items = (data?.items ?? []) as any[];
  const total: number = data?.total ?? 0;

  const board = useMutation({
    mutationFn: (id: string) => api.post(`/trips/${id}/board`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips'] }),
  });
  const complete = useMutation({
    mutationFn: (id: string) => api.post(`/trips/${id}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips'] }),
  });
  const noShow = useMutation({
    mutationFn: (id: string) => api.post(`/trips/${id}/no-show`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trips'] }),
  });

  const statuses = ['', 'SCHEDULED', 'CONFIRMED', 'BOARDED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Viagens do Dia</h2>
          <p className='text-sm text-slate-400'>{total} viagem(ns) registrada(s)</p>
        </div>
        <select
          className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {statuses.map((s) => <option key={s} value={s}>{s || 'Todos os status'}</option>)}
        </select>
      </div>

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
                <th className='p-3 text-left'>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6} className='p-6 text-center text-slate-500'>Nenhuma viagem encontrada</td></tr>
              )}
              {items.map((t: any) => (
                <tr key={t.id} className='border-t border-border hover:bg-slate-900/40 transition-colors'>
                  <td className='p-3 font-medium'>{t.patient?.name ?? '—'}</td>
                  <td className='p-3 text-xs text-slate-300'>{t.route?.origin ?? '—'} → {t.route?.destination ?? '—'}</td>
                  <td className='p-3'>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[t.status] ?? 'text-slate-400'}`}>{t.status}</span>
                  </td>
                  <td className='p-3 text-xs text-slate-400'>
                    {t.boardedAt ? new Date(t.boardedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className='p-3 text-center'>{t.qrScanned ? '✅' : '⬜'}</td>
                  <td className='p-3 flex gap-1 flex-wrap'>
                    {t.status === 'SCHEDULED' && (
                      <button type='button' onClick={() => board.mutate(t.id)} className='rounded bg-blue-900/50 px-2 py-1 text-xs text-blue-300 hover:bg-blue-800 transition-colors'>Embarcar</button>
                    )}
                    {(t.status === 'BOARDED' || t.status === 'IN_PROGRESS') && (
                      <button type='button' onClick={() => complete.mutate(t.id)} className='rounded bg-emerald-900/50 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-800 transition-colors'>Concluir</button>
                    )}
                    {t.status === 'SCHEDULED' && (
                      <button type='button' onClick={() => noShow.mutate(t.id)} className='rounded bg-red-900/50 px-2 py-1 text-xs text-red-300 hover:bg-red-800 transition-colors'>Falta</button>
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

