'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { routeService } from '@/services/operational.service';
import { useRealtimeStore } from '@/store/realtime.store';
import { OperationTimeline } from '@/components/operations/OperationTimeline';
import {
  getRouteStatusLabel,
  getTripStatusLabel,
  getConfirmationStatusLabel,
} from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trip {
  id: string;
  status: string;
  boardedAt: string | null;
  completedAt: string | null;
  qrScanned: boolean;
  patient: {
    id: string;
    name: string;
    mobility: string;
    phone: string | null;
  };
}

interface RouteDetail {
  id: string;
  status: string;
  origin: string;
  destination: string;
  date: string;
  scheduledAt: string | null;
  dispatchType: string;
  operationalStateDerived?: string;
  driver?: { id: string; user?: { name?: string } } | null;
  vehicle?: { id: string; plate?: string; model?: string; capacity?: number } | null;
  trips: Trip[];
  isStale?: boolean;
  staleLevel?: string;
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const TRIP_STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-slate-800 text-slate-400',
  PENDING_CONFIRMATION: 'bg-amber-900/50 text-amber-300',
  CONFIRMED: 'bg-blue-900/50 text-blue-300',
  BOARDING: 'bg-amber-900/50 text-amber-300',
  BOARDED: 'bg-cyan-900/50 text-cyan-300',
  IN_TRANSIT: 'bg-indigo-900/50 text-indigo-300',
  IN_PROGRESS: 'bg-indigo-900/50 text-indigo-300',
  ARRIVED: 'bg-emerald-900/50 text-emerald-300',
  COMPLETED: 'bg-emerald-900/50 text-emerald-300',
  NO_SHOW: 'bg-rose-900/50 text-rose-300',
  CANCELLED: 'bg-red-900/50 text-red-300',
};

const MOBILITY_ICON: Record<string, string> = {
  NORMAL: '🚶',
  WHEELCHAIR: '♿',
  STRETCHER: '🛏',
  OXYGEN: '💨',
};

const ROUTE_STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-blue-900/50 text-blue-300 border-blue-700/40',
  PLANNED: 'bg-slate-800 text-slate-400 border-slate-700',
  PENDING: 'bg-slate-800 text-slate-400 border-slate-700',
  DISPATCHED: 'bg-cyan-900/50 text-cyan-300 border-cyan-700/40',
  ACTIVE: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/40',
  PREPARING: 'bg-amber-900/50 text-amber-300 border-amber-700/40',
  RETURNING: 'bg-indigo-900/50 text-indigo-300 border-indigo-700/40',
  COMPLETED: 'bg-slate-700/50 text-slate-400 border-slate-600/40',
  CANCELLED: 'bg-red-900/50 text-red-300 border-red-700/40',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OperationDetailPage() {
  const params = useParams<{ routeId: string }>();
  const routeId = params?.routeId as string;
  const qc = useQueryClient();
  const revision = useRealtimeStore((s) => s.revision);

  const { data: route, isLoading, error } = useQuery<RouteDetail>({
    queryKey: ['operation-detail', routeId],
    queryFn: () => routeService.get(routeId),
    refetchInterval: 15_000,
    enabled: !!routeId,
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['operation-detail', routeId] });
    qc.invalidateQueries({ queryKey: ['route-timeline', routeId] });
  }, [revision, qc, routeId]);

  const startRoute = useMutation({
    mutationFn: () => routeService.startRoute(routeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operation-detail', routeId] }),
  });

  const completeRoute = useMutation({
    mutationFn: () => routeService.completeRoute(routeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operation-detail', routeId] }),
  });

  if (isLoading) {
    return (
      <div className='flex items-center justify-center py-20 text-slate-500'>
        Carregando operação…
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className='rounded-xl border border-red-900/40 bg-red-950/20 p-6 text-sm text-red-300'>
        Operação não encontrada.{' '}
        <Link href='/operations' className='underline'>← Voltar</Link>
      </div>
    );
  }

  const trips = route.trips ?? [];
  const boardedCount = trips.filter((t) =>
    ['BOARDED', 'IN_TRANSIT', 'IN_PROGRESS', 'ARRIVED', 'COMPLETED'].includes(t.status)
  ).length;
  const confirmedCount = trips.filter((t) =>
    ['CONFIRMED', 'BOARDING', 'BOARDED', 'IN_TRANSIT', 'IN_PROGRESS', 'ARRIVED', 'COMPLETED'].includes(t.status)
  ).length;
  const completedCount = trips.filter((t) => t.status === 'COMPLETED').length;

  const operDate = route.scheduledAt ?? route.date;
  const dateTimeStr = operDate
    ? new Date(operDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  const routeStatusStyle = ROUTE_STATUS_STYLE[route.status] ?? 'bg-slate-800 text-slate-400 border-slate-700';
  const isTerminal = ['COMPLETED', 'CANCELLED'].includes(route.status);
  const canStart = ['SCHEDULED', 'PLANNED', 'PENDING', 'DISPATCHED'].includes(route.status);
  const canComplete = ['ACTIVE', 'DISPATCHED', 'RETURNING', 'PREPARING'].includes(route.status);

  return (
    <section className='space-y-6'>
      {/* Back link + header */}
      <div>
        <Link href='/operations' className='text-xs text-slate-500 hover:text-slate-300 transition-colors'>
          ← Central de Operações
        </Link>
        <div className='mt-2 flex flex-wrap items-center justify-between gap-3'>
          <div>
            <div className='flex items-center gap-3 flex-wrap'>
              <h1 className='text-2xl font-bold text-slate-100'>{route.destination}</h1>
              <span className={`rounded-full border px-3 py-0.5 text-sm font-medium ${routeStatusStyle}`}>
                {getRouteStatusLabel(route.status)}
              </span>
              {route.isStale && (
                <span className='rounded-full border border-amber-700/40 bg-amber-900/30 px-2 py-0.5 text-xs text-amber-400'>
                  ⚠️ Rota estagnada
                </span>
              )}
            </div>
            <p className='mt-1 text-sm text-slate-400'>
              📍 {route.origin} → {route.destination} · {dateTimeStr}
            </p>
          </div>

          {/* Actions */}
          {!isTerminal && (
            <div className='flex gap-2'>
              {canStart && (
                <button
                  type='button'
                  disabled={startRoute.isPending}
                  onClick={() => startRoute.mutate()}
                  className='rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors'
                >
                  {startRoute.isPending ? '⏳…' : '▶ Iniciar Rota'}
                </button>
              )}
              {canComplete && (
                <button
                  type='button'
                  disabled={completeRoute.isPending}
                  onClick={() => {
                    if (confirm('Concluir esta operação?')) completeRoute.mutate();
                  }}
                  className='rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500 disabled:opacity-50 transition-colors'
                >
                  {completeRoute.isPending ? '⏳…' : '🏁 Concluir'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className='grid gap-4 sm:grid-cols-3'>
        <div className='rounded-xl border border-slate-800 bg-slate-900/60 p-4'>
          <div className='text-xs text-slate-500 mb-1'>Motorista</div>
          <div className='font-semibold text-slate-100'>
            {route.driver?.user?.name ?? <span className='text-slate-600'>Não atribuído</span>}
          </div>
        </div>
        <div className='rounded-xl border border-slate-800 bg-slate-900/60 p-4'>
          <div className='text-xs text-slate-500 mb-1'>Veículo</div>
          <div className='font-semibold text-slate-100'>
            {route.vehicle
              ? `${route.vehicle.plate} · ${route.vehicle.model}`
              : <span className='text-slate-600'>Não atribuído</span>}
          </div>
          {route.vehicle?.capacity && (
            <div className='text-xs text-slate-500 mt-0.5'>Capacidade: {route.vehicle.capacity}</div>
          )}
        </div>
        <div className='rounded-xl border border-slate-800 bg-slate-900/60 p-4'>
          <div className='text-xs text-slate-500 mb-1'>Pacientes</div>
          <div className='font-semibold text-slate-100'>{trips.length} total</div>
          <div className='mt-1 text-xs text-slate-400 space-x-2'>
            <span className='text-blue-400'>{confirmedCount} confirmado{confirmedCount !== 1 ? 's' : ''}</span>
            <span className='text-cyan-400'>{boardedCount} a bordo</span>
            <span className='text-emerald-400'>{completedCount} concluído{completedCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div className='grid gap-6 lg:grid-cols-2'>
        {/* Patient list */}
        <div className='space-y-3'>
          <h2 className='text-sm font-semibold uppercase tracking-widest text-slate-500'>
            👥 Pacientes
          </h2>
          <div className='space-y-2'>
            {trips.map((trip) => (
              <div
                key={trip.id}
                className='flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3'
              >
                <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-lg'>
                  {MOBILITY_ICON[trip.patient?.mobility] ?? '🚶'}
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='font-medium text-slate-100 truncate'>
                    {trip.patient?.name ?? trip.id}
                  </div>
                  {trip.patient?.phone && (
                    <div className='text-xs text-slate-500'>{trip.patient.phone}</div>
                  )}
                </div>
                <div className='flex flex-col items-end gap-1'>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRIP_STATUS_STYLE[trip.status] ?? 'bg-slate-800 text-slate-400'}`}>
                    {getTripStatusLabel(trip.status)}
                  </span>
                  {trip.qrScanned && (
                    <span className='text-xs text-emerald-400'>📷 QR lido</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className='space-y-3'>
          <h2 className='text-sm font-semibold uppercase tracking-widest text-slate-500'>
            📋 Timeline Operacional
          </h2>
          <div className='rounded-xl border border-slate-800 bg-slate-900/60 p-4'>
            <OperationTimeline routeId={routeId} />
          </div>
        </div>
      </div>
    </section>
  );
}
