'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { getDispatchStatusLabel } from '@/lib/i18n';
import { useRealtimeStore } from '@/store/realtime.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteCard {
  id: string;
  status: string;
  origin: string;
  destination: string;
  date: string;
  scheduledAt: string | null;
  dispatchType: string;
  driver: { id: string; user: { name: string } } | null;
  vehicle: { id: string; plate: string; model: string } | null;
  trips: Array<{
    id: string;
    status: string;
    patient?: { id: string; name: string; mobility: string } | null;
  }>;
}

// ─── Colunas do Kanban ────────────────────────────────────────────────────────

const KANBAN_COLUMNS: Array<{ status: string; label: string; color: string; bg: string }> = [
  { status: 'SCHEDULED',  label: 'Agendados',           color: 'text-blue-400',    bg: 'bg-blue-950/40' },
  { status: 'PENDING',    label: 'Aguard. Despacho',    color: 'text-amber-400',   bg: 'bg-amber-950/40' },
  { status: 'PREPARING',  label: 'Motorista a Caminho', color: 'text-yellow-400',  bg: 'bg-yellow-950/40' },
  { status: 'DISPATCHED', label: 'Embarcando',          color: 'text-orange-400',  bg: 'bg-orange-950/40' },
  { status: 'ACTIVE',     label: 'Em Viagem',           color: 'text-emerald-400', bg: 'bg-emerald-950/40' },
  { status: 'RETURNING',  label: 'Retornando',          color: 'text-cyan-400',    bg: 'bg-cyan-950/40' },
  { status: 'COMPLETED',  label: 'Finalizados',         color: 'text-slate-400',   bg: 'bg-slate-800/40' },
  { status: 'CANCELLED',  label: 'Cancelados',          color: 'text-red-400',     bg: 'bg-red-950/40' },
];

const MOBILITY_ICON: Record<string, string> = {
  NORMAL:     '🚶',
  WHEELCHAIR: '♿',
  STRETCHER:  '🛏',
  OXYGEN:     '💨',
};

// ─── Transições operacionais permitidas ──────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED:  ['PENDING', 'CANCELLED'],
  PENDING:    ['PREPARING', 'CANCELLED'],
  PREPARING:  ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['ACTIVE', 'CANCELLED'],
  ACTIVE:     ['RETURNING', 'COMPLETED'],
  RETURNING:  ['COMPLETED'],
};

// ─── Card de Rota ─────────────────────────────────────────────────────────────

function RouteKanbanCard({
  route,
  onMove,
}: {
  route: RouteCard;
  onMove: (routeId: string, newStatus: string) => void;
}) {
  const targets = ALLOWED_TRANSITIONS[route.status] ?? [];
  const dt = route.scheduledAt ? new Date(route.scheduledAt) : new Date(route.date);
  const timeStr = dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  return (
    <div className='rounded-lg border border-slate-700 bg-slate-800 p-3 space-y-2 shadow'>
      <div className='flex items-center justify-between gap-1'>
        <span className='font-mono text-xs text-slate-500'>{route.id.slice(0, 8)}</span>
        <span className='text-xs text-slate-400'>{timeStr}</span>
      </div>

      <div className='truncate text-sm font-medium text-slate-100'>
        {route.origin} → {route.destination}
      </div>

      {route.driver && (
        <div className='text-xs text-slate-400'>
          🧑‍✈️ {route.driver.user.name}
          {route.vehicle ? ` · ${route.vehicle.plate}` : ''}
        </div>
      )}

      {route.trips.length > 0 && (
        <div className='space-y-0.5'>
          {route.trips.map((t) => (
            <div key={t.id} className='flex items-center gap-1 text-xs text-slate-300'>
              {t.patient ? (
                <>
                  <span>{MOBILITY_ICON[t.patient.mobility] ?? '👤'}</span>
                  <span className='truncate'>{t.patient.name}</span>
                </>
              ) : (
                <span className='text-slate-500'>Paciente #{t.id.slice(0, 6)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {targets.length > 0 && (
        <div className='flex flex-wrap gap-1 pt-1 border-t border-slate-700'>
          {targets.map((next) => (
            <button
              key={next}
              onClick={() => onMove(route.id, next)}
              className='rounded px-2 py-0.5 text-xs bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors'
            >
              → {getDispatchStatusLabel(next)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function CentralOperacionalPage() {
  const qc = useQueryClient();
  const [filterDate, setFilterDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const revision = useRealtimeStore((s) => s.revision);

  const { data: routes = [], isLoading } = useQuery<RouteCard[]>({
    queryKey: ['central-routes', filterDate],
    queryFn: async () => {
      const res = await api.get('/routes', {
        params: { date: filterDate, limit: 200 },
      });
      return res.data?.items ?? res.data ?? [];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['central-routes'] });
  }, [revision, qc]);

  const moveMutation = useMutation({
    mutationFn: async ({ routeId, status }: { routeId: string; status: string }) => {
      await api.put(`/routes/${routeId}`, { status });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['central-routes'] }),
  });

  const handleMove = useCallback(
    (routeId: string, newStatus: string) => moveMutation.mutate({ routeId, status: newStatus }),
    [moveMutation],
  );

  // Agrupar rotas por status
  const byStatus: Record<string, RouteCard[]> = Object.fromEntries(
    KANBAN_COLUMNS.map((c) => [c.status, []]),
  );
  for (const r of routes) {
    if (r.status in byStatus) byStatus[r.status].push(r);
    else byStatus['PENDING'].push(r);
  }

  return (
    <div className='space-y-4'>
      {/* Header */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Central Operacional</h2>
          <p className='text-sm text-slate-400'>Kanban de despacho · Transporte SUS</p>
        </div>
        <label className='flex items-center gap-2 text-sm text-slate-400'>
          Data:
          <input
            type='date'
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className='rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500'
          />
        </label>
      </div>

      {isLoading ? (
        <div className='flex h-48 items-center justify-center text-slate-400'>
          Carregando rotas…
        </div>
      ) : (
        <div className='flex gap-3 overflow-x-auto pb-4'>
          {KANBAN_COLUMNS.map((col) => {
            const cards = byStatus[col.status] ?? [];
            return (
              <div
                key={col.status}
                className={`w-56 flex-shrink-0 rounded-lg p-3 space-y-2 ${col.bg}`}
              >
                <div className='flex items-center justify-between'>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${col.color}`}>
                    {col.label}
                  </span>
                  <span className='rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300'>
                    {cards.length}
                  </span>
                </div>

                <div className='min-h-[60px] space-y-2'>
                  {cards.map((r) => (
                    <RouteKanbanCard key={r.id} route={r} onMove={handleMove} />
                  ))}
                  {cards.length === 0 && (
                    <p className='py-4 text-center text-xs text-slate-600'>—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
