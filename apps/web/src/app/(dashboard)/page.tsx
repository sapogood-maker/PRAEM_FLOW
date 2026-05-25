'use client';

import Link from 'next/link';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import dynamic from 'next/dynamic';
import { useDashboard } from '@/hooks/useDashboard';
import type { OperationalKpis } from '@/types';
import { useRealtimeStore } from '@/store/realtime.store';
import { api } from '@/services/api';
import { useMutation } from '@tanstack/react-query';

const OperationalMap = dynamic(() => import('@/components/map/OperationalMap'), { ssr: false });

const EMPTY_KPIS: OperationalKpis = {
  patientsToday: 0,
  waitingPatients: 0,
  boardedPatients: 0,
  inTransitPatients: 0,
  arrivedPatients: 0,
  criticalPatients: 0,
  activeRoutes: 0,
  completedTrips: 0,
  activeVehicles: 0,
  averageOccupancy: 0,
  absences: 0,
  delays: 0,
  confirmationRate: 0,
  absenceRate: 0,
  unreachablePatients: 0,
  estimatedKmToday: 0,
  emptyTrips: 0,
};

export default function DashboardPage() {
  const { data } = useDashboard();
  const connected = useRealtimeStore((s) => s.connected);
  const routeOperationalStates = useRealtimeStore((s) => s.routeOperationalStates);
  const activityFeed = useRealtimeStore((s) => s.activityFeed);
  const boardingEvents = useRealtimeStore((s) => s.boardingEvents);

  const recoveryMutation = useMutation({
    mutationFn: async () => {
      const [routes, trips] = await Promise.all([
        api.post('/routes/recovery/stale', { cutoffHours: 12 }).then((r) => r.data),
        api.post('/trips/recovery/stale', { cutoffHours: 12 }).then((r) => r.data),
      ]);
      return { routes, trips };
    },
  });

  const operationalTimeline = activityFeed
    .filter((evt) => ['ops', 'replay', 'recovery', 'boarding', 'route', 'trip'].includes(evt.type))
    .slice(0, 8);
  const boardedVisible = boardingEvents.slice(0, 8);
  const activeRouteStates = Object.entries(routeOperationalStates)
    .sort((a, b) => +new Date(b[1].updatedAt) - +new Date(a[1].updatedAt))
    .slice(0, 6);

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Central de Comando</h2>
          <p className='text-sm text-slate-400'>Central Operacional Logística · Transporte SUS</p>
        </div>
      </div>

      {/* KPIs */}
      <KPIGrid kpis={data ?? EMPTY_KPIS} />

      <div className='grid gap-4 xl:grid-cols-[1fr_1fr]'>
        <section className='rounded-xl border border-border bg-panel p-4 space-y-3'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400'>Indicadores operacionais realtime</h3>
            <Link href='/replay' className='rounded bg-cyan-900 px-2 py-1 text-xs font-semibold text-cyan-300 hover:bg-cyan-800'>
              Abrir replay
            </Link>
          </div>
          <div className='grid gap-2 sm:grid-cols-3'>
            <div className='rounded-lg border border-border bg-slate-900 p-3'>
              <p className='text-xs uppercase text-slate-500'>WebSocket</p>
              <p className={`text-sm font-semibold ${connected ? 'text-emerald-300' : 'text-red-300'}`}>
                {connected ? 'Conectado' : 'Desconectado'}
              </p>
            </div>
            <div className='rounded-lg border border-border bg-slate-900 p-3'>
              <p className='text-xs uppercase text-slate-500'>Rotas monitoradas</p>
              <p className='text-sm font-semibold text-cyan-200'>{Object.keys(routeOperationalStates).length}</p>
            </div>
            <div className='rounded-lg border border-border bg-slate-900 p-3'>
              <p className='text-xs uppercase text-slate-500'>Embarques visíveis</p>
              <p className='text-sm font-semibold text-blue-200'>{boardedVisible.length}</p>
            </div>
          </div>
          <ul className='space-y-2'>
            {activeRouteStates.map(([routeId, state]) => (
              <li key={routeId} className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-300'>
                <span className='font-semibold text-cyan-300'>Rota {routeId.slice(0, 8)}</span> · {state.operationalState} ·{' '}
                {new Date(state.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </li>
            ))}
            {activeRouteStates.length === 0 && (
              <li className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-500'>
                Aguardando estados operacionais em tempo real.
              </li>
            )}
          </ul>
        </section>

        <section className='rounded-xl border border-border bg-panel p-4 space-y-3'>
          <div className='flex items-center justify-between gap-2'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400'>Recuperação operacional</h3>
            <button
              type='button'
              onClick={() => recoveryMutation.mutate()}
              disabled={recoveryMutation.isPending}
              className='rounded bg-amber-900 px-2 py-1 text-xs font-semibold text-amber-300 disabled:opacity-60 hover:bg-amber-800'
            >
              {recoveryMutation.isPending ? 'Executando…' : 'Executar recuperação stale'}
            </button>
          </div>
          <ul className='space-y-2'>
            {boardedVisible.map((evt) => (
              <li key={`${evt.tripId}-${evt.patientId}-${evt.boardedAt}`} className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-300'>
                🟢 {evt.patientName ?? evt.patientId} · Trip {evt.tripId.slice(0, 8)} ·{' '}
                {new Date(evt.boardedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </li>
            ))}
            {boardedVisible.length === 0 && (
              <li className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-500'>
                Nenhum embarque recente recebido.
              </li>
            )}
          </ul>
          {recoveryMutation.data && (
            <div className='rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-2 text-xs text-amber-200'>
              Rotas processadas: {recoveryMutation.data.routes?.processed ?? 0} · Trips processadas:{' '}
              {Array.isArray(recoveryMutation.data.trips?.processed) ? recoveryMutation.data.trips.processed.length : 0}
            </div>
          )}
        </section>
      </div>

      <section className='rounded-xl border border-border bg-panel p-4 space-y-3'>
        <div className='flex items-center justify-between gap-2'>
          <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400'>Timeline operacional clara</h3>
          <Link href='/replay' className='text-xs text-cyan-400 hover:text-cyan-300'>
            Entradas de replay →
          </Link>
        </div>
        <ul className='space-y-2 max-h-56 overflow-y-auto pr-1'>
          {operationalTimeline.map((evt) => (
            <li key={evt.id} className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-300'>
              <p className='font-medium'>{evt.message}</p>
              <p className='text-slate-500'>
                {new Date(evt.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </p>
            </li>
          ))}
          {operationalTimeline.length === 0 && (
            <li className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-500'>
              Sem eventos operacionais no momento.
            </li>
          )}
        </ul>
      </section>

      {/* Map + Activity */}
      <div className='grid gap-6 xl:grid-cols-[1fr_380px]'>
        <OperationalMap />
        <ActivityFeed />
      </div>
    </div>
  );
}
