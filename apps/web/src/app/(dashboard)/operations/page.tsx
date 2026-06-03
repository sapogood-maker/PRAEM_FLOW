'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { routeService } from '@/services/operational.service';
import { useRealtimeStore } from '@/store/realtime.store';
import { getRouteStatusLabel } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteItem {
  id: string;
  status: string;
  origin: string;
  destination: string;
  date: string;
  scheduledAt: string | null;
  dispatchType: string;
  operationalStateDerived?: string;
  driver?: { user?: { name?: string } } | null;
  vehicle?: { plate?: string; model?: string } | null;
  trips?: Array<{ id: string; status: string; boardedAt?: string | null }>;
}

// ─── Status styling ───────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-blue-900/60 text-blue-300 border-blue-700/40',
  PLANNED: 'bg-slate-800 text-slate-300 border-slate-700',
  PENDING: 'bg-slate-800 text-slate-300 border-slate-700',
  PREPARING: 'bg-amber-900/60 text-amber-300 border-amber-700/40',
  DISPATCHED: 'bg-cyan-900/60 text-cyan-300 border-cyan-700/40',
  ACTIVE: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/40',
  WAITING_CONSULTATION: 'bg-blue-900/60 text-blue-300 border-blue-700/40',
  RETURNING: 'bg-indigo-900/60 text-indigo-300 border-indigo-700/40',
  COMPLETED: 'bg-slate-700/60 text-slate-400 border-slate-600/40',
  CANCELLED: 'bg-red-900/60 text-red-300 border-red-700/40',
};

const OP_STATE_ICON: Record<string, string> = {
  CREATED: '🔵',
  DISPATCHED: '📡',
  DRIVER_ACCEPTED: '✅',
  WAITING_PATIENT: '⏳',
  BOARDING: '🚪',
  BOARDED: '🧑',
  PASSENGERS_ONBOARD: '👥',
  IN_TRANSIT: '🛣️',
  ARRIVED: '🏥',
  COMPLETED: '🏁',
  CANCELLED: '❌',
};

const ACTIVE_STATUSES = ['DISPATCHED', 'ACTIVE', 'PREPARING', 'WAITING_CONSULTATION', 'RETURNING'];
const RECENT_STATUSES = ['SCHEDULED', 'PLANNED', 'PENDING'];

function TripStatusDots({ trips }: { trips: RouteItem['trips'] }) {
  if (!trips || trips.length === 0) return null;
  return (
    <div className='flex flex-wrap gap-1'>
      {trips.map((t) => {
        const s = t.status;
        const color =
          s === 'COMPLETED' ? 'bg-emerald-500' :
          s === 'BOARDED' || s === 'IN_TRANSIT' ? 'bg-cyan-500' :
          s === 'CONFIRMED' ? 'bg-blue-500' :
          s === 'BOARDING' ? 'bg-amber-500' :
          s === 'CANCELLED' ? 'bg-red-500' :
          s === 'NO_SHOW' ? 'bg-rose-500' :
          'bg-slate-600';
        return (
          <div
            key={t.id}
            title={s}
            className={`h-2.5 w-2.5 rounded-full ${color}`}
          />
        );
      })}
    </div>
  );
}

// ─── OperationCard ────────────────────────────────────────────────────────────

function OperationCard({ route }: { route: RouteItem }) {
  const trips = route.trips ?? [];
  const boardedCount = trips.filter((t) => ['BOARDED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED'].includes(t.status)).length;
  const confirmedCount = trips.filter((t) => ['CONFIRMED', 'BOARDING', 'BOARDED', 'IN_TRANSIT', 'ARRIVED', 'COMPLETED'].includes(t.status)).length;
  const operDate = route.scheduledAt ?? route.date;
  const timeStr = operDate
    ? new Date(operDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;
  const dateStr = operDate
    ? new Date(operDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : null;
  const opState = route.operationalStateDerived ?? route.status;
  const opIcon = OP_STATE_ICON[opState] ?? '🔵';
  const statusStyle = STATUS_STYLE[route.status] ?? 'bg-slate-800 text-slate-300 border-slate-700';

  return (
    <Link href={`/operations/${route.id}`}>
      <div className='group rounded-xl border border-slate-800 bg-slate-900/80 p-4 transition-all hover:border-slate-600 hover:bg-slate-800/80 hover:shadow-lg cursor-pointer'>
        {/* Top row */}
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2 flex-wrap'>
              <span className='text-base'>{opIcon}</span>
              <span className='font-semibold text-slate-100 truncate'>{route.destination}</span>
              <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
                {getRouteStatusLabel(route.status)}
              </span>
              {route.dispatchType === 'IMMEDIATE' && (
                <span className='rounded-full bg-cyan-900/40 border border-cyan-700/40 px-2 py-0.5 text-xs text-cyan-400'>
                  ⚡ Imediato
                </span>
              )}
            </div>
            <div className='mt-1 text-xs text-slate-500 truncate'>
              📍 {route.origin}
            </div>
          </div>
          <div className='shrink-0 text-right text-xs text-slate-500'>
            {dateStr && <div>{dateStr}</div>}
            {timeStr && <div className='font-mono text-slate-400'>{timeStr}</div>}
          </div>
        </div>

        {/* Middle row: driver + vehicle */}
        <div className='mt-3 flex flex-wrap gap-3 text-xs'>
          <span className='flex items-center gap-1 text-slate-400'>
            🧑‍✈️ {route.driver?.user?.name ?? <span className='text-slate-600'>Sem motorista</span>}
          </span>
          {route.vehicle && (
            <span className='flex items-center gap-1 text-slate-400'>
              🚐 {route.vehicle.plate} · {route.vehicle.model}
            </span>
          )}
        </div>

        {/* Bottom row: trip dots + counts */}
        <div className='mt-3 flex items-center justify-between'>
          <TripStatusDots trips={trips} />
          <div className='flex gap-3 text-xs text-slate-500'>
            <span>👥 {trips.length} paciente{trips.length !== 1 ? 's' : ''}</span>
            {confirmedCount > 0 && <span className='text-blue-400'>✅ {confirmedCount} confirmado{confirmedCount !== 1 ? 's' : ''}</span>}
            {boardedCount > 0 && <span className='text-cyan-400'>🚪 {boardedCount} a bordo</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperationsPage() {
  const qc = useQueryClient();
  const revision = useRealtimeStore((s) => s.revision);

  const { data: activeData, isLoading: loadingActive } = useQuery({
    queryKey: ['operations-active'],
    queryFn: () => routeService.list({ status: ACTIVE_STATUSES.join(','), limit: 50 }),
    refetchInterval: 10_000,
  });

  const { data: scheduledData, isLoading: loadingScheduled } = useQuery({
    queryKey: ['operations-scheduled'],
    queryFn: () => routeService.list({ status: RECENT_STATUSES.join(','), limit: 30 }),
    refetchInterval: 30_000,
  });

  const { data: completedData } = useQuery({
    queryKey: ['operations-completed'],
    queryFn: () => routeService.list({ status: 'COMPLETED', limit: 20 }),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['operations-active'] });
    qc.invalidateQueries({ queryKey: ['operations-scheduled'] });
  }, [revision, qc]);

  const activeRoutes: RouteItem[] = activeData?.items ?? [];
  const scheduledRoutes: RouteItem[] = scheduledData?.items ?? [];
  const completedRoutes: RouteItem[] = completedData?.items ?? [];

  return (
    <section className='space-y-8'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-slate-100'>⚡ Central de Operações</h1>
          <p className='text-sm text-slate-400'>
            Monitoramento em tempo real — despacho, embarque, trânsito e conclusão
          </p>
        </div>
        <Link
          href='/queue'
          className='rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors'
        >
          ➕ Nova Operação
        </Link>
      </div>

      {/* KPI strip */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {[
          { label: 'Ativas', value: activeRoutes.length, color: 'text-emerald-400', bg: 'bg-emerald-900/20 border-emerald-800/40' },
          { label: 'Agendadas', value: scheduledRoutes.length, color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-800/40' },
          { label: 'Pacientes em trânsito', value: activeRoutes.flatMap((r) => r.trips ?? []).filter((t) => ['IN_TRANSIT', 'BOARDED'].includes(t.status)).length, color: 'text-cyan-400', bg: 'bg-cyan-900/20 border-cyan-800/40' },
          { label: 'Concluídas hoje', value: completedRoutes.length, color: 'text-slate-400', bg: 'bg-slate-800/40 border-slate-700/40' },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-xl border p-4 ${kpi.bg}`}>
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className='text-xs text-slate-500 mt-0.5'>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Active operations */}
      <div>
        <h2 className='mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-500'>
          <span className='h-2 w-2 rounded-full bg-emerald-500 animate-pulse' />
          Em andamento
        </h2>
        {loadingActive ? (
          <div className='text-sm text-slate-500'>Carregando…</div>
        ) : activeRoutes.length === 0 ? (
          <div className='rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-500'>
            Nenhuma operação ativa no momento.{' '}
            <Link href='/queue' className='text-cyan-400 underline'>Ir para a Fila Operacional</Link>
          </div>
        ) : (
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
            {activeRoutes.map((r) => <OperationCard key={r.id} route={r} />)}
          </div>
        )}
      </div>

      {/* Scheduled operations */}
      {scheduledRoutes.length > 0 && (
        <div>
          <h2 className='mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-500'>
            📅 Agendadas / Pendentes
          </h2>
          {loadingScheduled ? (
            <div className='text-sm text-slate-500'>Carregando…</div>
          ) : (
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
              {scheduledRoutes.map((r) => <OperationCard key={r.id} route={r} />)}
            </div>
          )}
        </div>
      )}

      {/* Completed today */}
      {completedRoutes.length > 0 && (
        <div>
          <h2 className='mb-3 text-sm font-semibold uppercase tracking-widest text-slate-600'>
            🏁 Concluídas recentemente
          </h2>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
            {completedRoutes.map((r) => <OperationCard key={r.id} route={r} />)}
          </div>
        </div>
      )}
    </section>
  );
}
