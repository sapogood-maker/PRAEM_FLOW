'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

// ─── Status helpers ───────────────────────────────────────────────────────────

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

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: '📅 Agendado',
  PENDING: '⏳ Pendente',
  PLANNED: '🗒️ Planejado',
  PREPARING: '🔧 Em Preparação',
  DISPATCHED: '📡 Despachado',
  ACTIVE: '🚐 Em Andamento',
  COMPLETED: '✅ Finalizado',
  CANCELLED: '❌ Cancelado',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const today = new Date();
  const [startDate, setStartDate] = useState(toIsoDate(today));
  const [endDate, setEndDate] = useState(toIsoDate(addDays(today, 6)));
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['schedule-routes', startDate, endDate, statusFilter],
    queryFn: () =>
      api
        .get('/routes', {
          params: {
            startDate,
            endDate,
            ...(statusFilter && { status: statusFilter }),
            limit: 100,
          },
        })
        .then((r) => r.data),
  });

  const items: any[] = data?.items ?? data ?? [];

  // Group routes by date for calendar-like display
  const byDate = items.reduce<Record<string, any[]>>((acc, r) => {
    const d = (r.scheduledAt ?? r.date ?? '').split('T')[0];
    if (d) {
      acc[d] = acc[d] ?? [];
      acc[d].push(r);
    }
    return acc;
  }, {});

  const sortedDates = Object.keys(byDate).sort();

  // Generate days in range for empty-day display
  const rangeDays: string[] = [];
  if (startDate && endDate) {
    let cur = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (cur <= end) {
      rangeDays.push(toIsoDate(cur));
      cur = addDays(cur, 1);
    }
  }

  const allDays = Array.from(new Set([...rangeDays, ...sortedDates])).sort();

  function setPreset(days: number) {
    setStartDate(toIsoDate(today));
    setEndDate(toIsoDate(addDays(today, days - 1)));
  }

  return (
    <section className='space-y-6'>
      {/* Header */}
      <div>
        <h2 className='text-2xl font-bold text-slate-100'>Agenda Operacional</h2>
        <p className='text-sm text-slate-400'>
          Rotas agendadas e programadas — independente de status online/offline
        </p>
      </div>

      {/* Filters */}
      <div className='flex flex-wrap items-end gap-3 rounded-xl border border-border bg-panel p-4'>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>De</label>
          <input
            type='date'
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          />
        </div>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>Até</label>
          <input
            type='date'
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          />
        </div>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          >
            <option value=''>Todos</option>
            {Object.keys(STATUS_LABEL).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Presets */}
        <div className='flex gap-2 self-end'>
          {[
            { label: 'Hoje', days: 1 },
            { label: '7 dias', days: 7 },
            { label: '14 dias', days: 14 },
            { label: '30 dias', days: 30 },
          ].map(({ label, days }) => (
            <button
              key={days}
              type='button'
              onClick={() => setPreset(days)}
              className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-400 hover:text-slate-100 transition-colors'
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type='button'
          onClick={() => refetch()}
          className='self-end rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 transition-colors'
        >
          Atualizar
        </button>
      </div>

      {/* Summary */}
      <div className='flex flex-wrap gap-3 text-xs'>
        <span className='rounded-lg border border-border bg-panel px-3 py-2 text-slate-300'>
          Total: <strong>{items.length}</strong> rota(s)
        </span>
        {Object.entries(
          items.reduce<Record<string, number>>((acc, r) => {
            acc[r.status] = (acc[r.status] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([status, count]) => (
          <span key={status} className={`rounded-lg px-3 py-2 font-medium ${STATUS_BADGE[status] ?? 'bg-slate-800 text-slate-400'}`}>
            {STATUS_LABEL[status] ?? status}: {count}
          </span>
        ))}
      </div>

      {/* Calendar-like list */}
      {isLoading ? (
        <div className='flex justify-center p-8'>
          <LoadingSpinner />
        </div>
      ) : (
        <div className='space-y-4'>
          {allDays.map((day) => {
            const dayRoutes = byDate[day] ?? [];
            const isToday = day === toIsoDate(today);
            const isPast = day < toIsoDate(today);
            const dateLabel = new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            });

            return (
              <div
                key={day}
                className={`rounded-xl border bg-panel ${isToday ? 'border-cyan-700' : 'border-border'}`}
              >
                {/* Day header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 border-b border-border ${
                    isToday ? 'bg-cyan-950/30' : isPast ? 'bg-slate-900/40' : ''
                  }`}
                >
                  <div className='flex items-center gap-2'>
                    {isToday && (
                      <span className='rounded bg-cyan-700 px-2 py-0.5 text-xs font-bold text-white'>
                        HOJE
                      </span>
                    )}
                    <span className={`font-semibold capitalize ${isPast && !isToday ? 'text-slate-500' : 'text-slate-100'}`}>
                      {dateLabel}
                    </span>
                  </div>
                  <span className='rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400'>
                    {dayRoutes.length} rota(s)
                  </span>
                </div>

                {/* Routes for this day */}
                {dayRoutes.length === 0 ? (
                  <p className='px-4 py-3 text-xs text-slate-600'>Sem rotas programadas</p>
                ) : (
                  <ul className='divide-y divide-border'>
                    {dayRoutes.map((r: any) => {
                      const timeStr = r.scheduledAt
                        ? new Date(r.scheduledAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : null;
                      return (
                        <li key={r.id} className='flex items-start gap-4 px-4 py-3'>
                          {/* Time */}
                          <div className='w-12 shrink-0 text-right text-xs font-mono text-slate-400 pt-0.5'>
                            {timeStr ?? '—'}
                          </div>

                          {/* Info */}
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-2 flex-wrap'>
                              <span className='font-medium text-slate-100 truncate'>
                                {r.origin} → {r.destination}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                  STATUS_BADGE[r.status] ?? 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {STATUS_LABEL[r.status] ?? r.status}
                              </span>
                            </div>
                            <p className='mt-0.5 text-xs text-slate-400'>
                              Motorista: {r.driver?.user?.name ?? <em>a atribuir</em>}
                              {' · '}
                              Veículo: {r.vehicle?.plate ?? '—'}
                              {' · '}
                              {r.trips?.length ?? 0} paciente(s)
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {allDays.length === 0 && (
            <div className='rounded-xl border border-border bg-panel p-8 text-center text-slate-500'>
              Nenhuma rota no período selecionado.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
