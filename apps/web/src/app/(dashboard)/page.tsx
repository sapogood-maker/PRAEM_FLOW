'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Route, Users, Truck, X } from 'lucide-react';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { OperationalRail } from '@/components/dashboard/OperationalRail';
import { useDashboard } from '@/hooks/useDashboard';
import { useQueue } from '@/hooks/useQueue';
import { routeService } from '@/services/operational.service';
import { useRealtimeStore } from '@/store/realtime.store';
import { useOperationalControlStore } from '@/store/operationalControl.store';
import { UI_TEXT } from '@/lib/ui-text';
import { getPriorityLabel, getQueueStatusLabel, getRouteStatusLabel } from '@/lib/i18n';
import type { OperationalKpis, QueueItem } from '@/types';

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

const LIVE_QUEUE_FILTER = 'WAITING,CONFIRMED,BOARDING,IN_TRANSIT,CALLED,CHECKED_IN,ASSIGNED,SCHEDULED';
const LIVE_ROUTE_FILTER = 'SCHEDULED,PLANNED,PENDING,PREPARING,DISPATCHED,ACTIVE,RETURNING';

type DashboardQueueItem = QueueItem & {
  lat?: number | null;
  lng?: number | null;
  routeId?: string | null;
  operationId?: string | null;
  patient?: { name?: string; mobility?: string; specialNeeds?: string | null };
  healthcareLocation?: { name?: string; city?: string; latitude?: number; longitude?: number };
};

type DashboardPickupPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  appointmentDate?: string | null;
  destination?: string | null;
  patientName?: string | null;
  status?: string | null;
  priority?: string | null;
};

type DashboardRoute = {
  id: string;
  operationId?: string | null;
  status: string;
  origin?: string | null;
  destination?: string | null;
  date?: string;
  scheduledAt?: string | null;
  dispatchType?: string;
  driver?: { id: string; user?: { name?: string | null } | null } | null;
  vehicle?: { id: string; plate?: string | null; model?: string | null; capacity?: number | null } | null;
  trips?: Array<{
    id: string;
    status?: string | null;
    patient?: { id: string; name?: string | null } | null;
  }>;
};

function getTimeLabel(value?: string | null) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function resolvePickupPoint(item: DashboardQueueItem) {
  const lat = Number(item.healthcareLocation?.latitude ?? item.lat);
  const lng = Number(item.healthcareLocation?.longitude ?? item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function resolveQueueIds(route: DashboardRoute, items: DashboardQueueItem[]) {
  const patientIds = new Set(route.trips?.map((trip) => trip.patient?.id).filter((id): id is string => Boolean(id)) ?? []);
  return items.filter((item) => patientIds.has(item.patientId)).map((item) => item.id);
}

function resolveCenter(route: DashboardRoute, vehicles: Array<{ vehicleId: string; lat: number; lng: number; routeId?: string | null }>, queueItems: DashboardQueueItem[]) {
  const routeVehicle = route.vehicle ? vehicles.find((vehicle) => vehicle.vehicleId === route.vehicle?.id) : null;
  if (routeVehicle) return { lat: routeVehicle.lat, lng: routeVehicle.lng };
  const linkedPickup = route.trips
    ?.map((trip) => queueItems.find((item) => item.patientId === trip.patient?.id))
    .find((item) => Boolean(item && resolvePickupPoint(item)));
  const pickupPoint = linkedPickup ? resolvePickupPoint(linkedPickup) : null;
  return pickupPoint ?? null;
}

function routeStatusTone(status: string) {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300';
    case 'DISPATCHED':
      return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300';
    case 'PREPARING':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
    case 'RETURNING':
      return 'border-indigo-500/20 bg-indigo-500/10 text-indigo-300';
    case 'COMPLETED':
      return 'border-slate-700 bg-slate-900 text-slate-400';
    case 'CANCELLED':
      return 'border-red-500/20 bg-red-500/10 text-red-300';
    default:
      return 'border-slate-700 bg-slate-900 text-slate-400';
  }
}

function QueueCard({
  item,
  focused,
  onFocus,
}: {
  item: DashboardQueueItem;
  focused: boolean;
  onFocus: () => void;
}) {
  const pickup = resolvePickupPoint(item);
  return (
    <button
      type='button'
      onClick={onFocus}
      className={`w-full rounded-2xl border p-3 text-left transition-colors ${
        focused ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/10'
      }`}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium text-slate-100'>{item.patient?.name ?? item.patientId}</p>
          <p className='mt-1 text-xs text-slate-500'>
            {item.destination} · {getTimeLabel(item.appointmentDate)}
          </p>
        </div>
        <span className='rounded-full border border-white/5 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-300'>
          {getQueueStatusLabel(item.status)}
        </span>
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400'>
        <span className='rounded-full bg-white/5 px-2 py-1'>{getPriorityLabel(item.priority)}</span>
        {item.confirmationStatus && <span className='rounded-full bg-white/5 px-2 py-1'>{item.confirmationStatus}</span>}
        {pickup && <span className='rounded-full bg-white/5 px-2 py-1'><MapPin size={10} className='mr-1 inline' />{pickup.lat.toFixed(3)}, {pickup.lng.toFixed(3)}</span>}
      </div>
    </button>
  );
}

function RouteCard({
  route,
  focused,
  onFocus,
}: {
  route: DashboardRoute;
  focused: boolean;
  onFocus: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onFocus}
      className={`w-full rounded-2xl border p-3 text-left transition-colors ${
        focused ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/10'
      }`}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='truncate text-sm font-medium text-slate-100'>
            {route.origin ?? 'Origem'} → {route.destination ?? 'Destino'}
          </p>
          <p className='mt-1 text-xs text-slate-500'>
            {route.vehicle?.plate ?? 'Sem veículo'} · {route.driver?.user?.name ?? 'Sem motorista'}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${routeStatusTone(route.status)}`}>
          {getRouteStatusLabel(route.status)}
        </span>
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400'>
        <span className='rounded-full bg-white/5 px-2 py-1'>{route.operationId ? `Op ${route.operationId.slice(0, 8)}` : `Rota ${route.id.slice(0, 8)}`}</span>
        <span className='rounded-full bg-white/5 px-2 py-1'><Users size={10} className='mr-1 inline' />{route.trips?.length ?? 0} pacientes</span>
        <span className='rounded-full bg-white/5 px-2 py-1'><Truck size={10} className='mr-1 inline' />{route.vehicle?.plate ?? '—'}</span>
      </div>
    </button>
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data } = useDashboard();
  const { data: queueData } = useQueue({ limit: 50, status: LIVE_QUEUE_FILTER });
  const { data: routesData } = useQuery<{ items?: DashboardRoute[] } | DashboardRoute[]>({
    queryKey: ['dashboard-active-routes'],
    queryFn: () => routeService.list({ limit: 100, status: LIVE_ROUTE_FILTER }),
    refetchInterval: 15_000,
  });

  const revision = useRealtimeStore((s) => s.revision);
  const connected = useRealtimeStore((s) => s.connected);
  const routeOperationalStates = useRealtimeStore((s) => s.routeOperationalStates);
  const activityFeed = useRealtimeStore((s) => s.activityFeed);
  const boardingEvents = useRealtimeStore((s) => s.boardingEvents);
  const vehicles = useRealtimeStore((s) => s.vehiclePositions);
  const focus = useOperationalControlStore((s) => s.focus);
  const setFocus = useOperationalControlStore((s) => s.setFocus);
  const clearFocus = useOperationalControlStore((s) => s.clearFocus);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis'] });
    queryClient.invalidateQueries({ queryKey: ['queue'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-active-routes'] });
  }, [queryClient, revision]);

  const kpis = data ?? EMPTY_KPIS;
  const queueItems = (queueData?.items ?? []) as DashboardQueueItem[];
  const routes = (Array.isArray(routesData) ? routesData : routesData?.items ?? []).filter(
    (r) => (r.trips?.length ?? 0) > 0,
  ) as DashboardRoute[];
  const activeRouteCount = Object.keys(routeOperationalStates).length;
  const liveSignals = activityFeed.filter((event) => event.type === 'alert').length;

  const pickupPoints = useMemo(
    () =>
      queueItems
        .filter((item) => item.status !== 'CANCELLED')
        .map<DashboardPickupPoint | null>((item) => {
          const point = resolvePickupPoint(item);
          if (!point) return null;
          return {
            id: item.id,
            lat: point.lat,
            lng: point.lng,
            label: item.patient?.name ?? item.patientId,
            appointmentDate: item.appointmentDate,
            destination: item.destination,
            patientName: item.patient?.name ?? item.patientId,
            status: item.status,
            priority: item.priority,
          };
        })
        .filter((point): point is DashboardPickupPoint => point !== null),
    [queueItems],
  );

  const selectedQueueIds = new Set(focus?.queueIds ?? []);
  const selectedRoute = useMemo(
    () =>
      focus?.routeId
        ? routes.find((route) => route.id === focus.routeId || route.operationId === focus.routeId || route.operationId === focus.operationId)
        : focus?.operationId
          ? routes.find((route) => route.operationId === focus.operationId)
          : null,
    [focus?.operationId, focus?.routeId, routes],
  );
  const focusSummary = focus
    ? {
        title: focus.label ?? selectedRoute?.destination ?? 'Foco operacional',
        subtitle: focus.scope === 'queue'
          ? 'Fila selecionada'
          : focus.scope === 'vehicle'
            ? 'Veículo em foco'
            : focus.scope === 'operation'
              ? 'Operação em foco'
              : 'Rota em foco',
      }
    : null;

  return (
    <div className='space-y-6'>
      <header className='space-y-4'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div className='max-w-3xl'>
            <p className='text-[11px] uppercase tracking-[0.35em] text-cyan-300/70'>{UI_TEXT.dashboard.overline}</p>
            <h2 className='mt-2 text-3xl font-semibold text-slate-50'>{UI_TEXT.dashboard.title}</h2>
            <p className='mt-2 text-sm text-slate-400'>{UI_TEXT.dashboard.description}</p>
          </div>
          <div className='flex flex-wrap items-center gap-2 text-xs text-slate-400'>
            <Link
              href='/schedule'
              className='inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500'
            >
              Importar Operação
            </Link>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${connected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-300 animate-pulse' : 'bg-slate-500'}`} />
              {connected ? UI_TEXT.dashboard.realtimeConnected : UI_TEXT.dashboard.realtimeOffline}
            </span>
            <span className='rounded-full border border-white/5 bg-white/5 px-3 py-1 text-slate-300'>
              {activeRouteCount} {UI_TEXT.dashboard.routesTracked}
            </span>
            <span className='rounded-full border border-white/5 bg-white/5 px-3 py-1 text-slate-300'>
              {boardingEvents.length} {UI_TEXT.dashboard.boardingEvents}
            </span>
          </div>
        </div>

        <KPIGrid kpis={kpis} />
      </header>

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_420px]'>
        <OperationalMap pickupPoints={pickupPoints} queueItems={queueItems} routes={routes} showFleetList={false} className='h-full' />

        <aside className='space-y-4'>
          <div className='rounded-[24px] border border-white/5 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-xl'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Centro Operacional</p>
                <h3 className='mt-1 text-lg font-semibold text-slate-100'>Queue + Map + Rotas</h3>
              </div>
              {focus && (
                <button type='button' onClick={clearFocus} className='rounded-full border border-white/5 bg-white/5 p-2 text-slate-400 hover:text-slate-200'>
                  <X size={14} />
                </button>
              )}
            </div>

            {focusSummary ? (
              <div className='mt-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4'>
                <p className='text-[11px] uppercase tracking-[0.3em] text-cyan-300/70'>{focusSummary.subtitle}</p>
                <h4 className='mt-1 text-base font-semibold text-slate-100'>{focusSummary.title}</h4>
                <div className='mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300'>
                  <div className='rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2'>
                    <span className='block text-[11px] uppercase tracking-[0.2em] text-slate-500'>Pacientes</span>
                    <span className='text-sm font-semibold text-slate-100'>{focus?.queueIds.length ?? 0}</span>
                  </div>
                  <div className='rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2'>
                    <span className='block text-[11px] uppercase tracking-[0.2em] text-slate-500'>Status</span>
                    <span className='text-sm font-semibold text-slate-100'>{focus?.status ?? 'ATIVO'}</span>
                  </div>
                </div>
                {selectedRoute && (
                  <Link
                    href={`/operations/${selectedRoute.id}`}
                    className='mt-3 inline-flex rounded-full border border-white/5 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/30 hover:text-cyan-200'
                  >
                    Abrir operação
                  </Link>
                )}
              </div>
            ) : (
              <div className='mt-4 rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-sm text-slate-500'>
                Selecione um paciente, rota ou veículo para focar a operação.
              </div>
            )}
          </div>

          <div className='rounded-[24px] border border-white/5 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-xl'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Rotas Ativas</p>
                <h3 className='mt-1 text-sm font-semibold text-slate-100'>{routes.length} operações</h3>
              </div>
              <Route className='text-slate-500' size={16} />
            </div>
            <div className='mt-4 space-y-2 max-h-[240px] overflow-y-auto pr-1'>
              {routes.length === 0 ? (
                <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-sm text-slate-500'>Nenhuma rota ativa.</div>
              ) : (
                routes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    focused={focus?.routeId === route.id || focus?.operationId === route.operationId || focus?.vehicleId === route.vehicle?.id}
                    onFocus={() => {
                      const queueIds = resolveQueueIds(route, queueItems);
                      const center = resolveCenter(route, vehicles, queueItems);
                      setFocus({
                        scope: route.operationId ? 'operation' : 'route',
                        queueIds,
                        routeId: route.id,
                        vehicleId: route.vehicle?.id ?? null,
                        operationId: route.operationId ?? route.id,
                        center: center ?? undefined,
                        zoom: center ? 15 : 13,
                        label: `${route.origin ?? 'Origem'} → ${route.destination ?? 'Destino'}`,
                        status: route.status,
                      });
                    }}
                  />
                ))
              )}
            </div>
          </div>

          <div className='rounded-[24px] border border-white/5 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-xl'>
            <div className='flex items-center justify-between'>
              <div>
                <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Fila Operacional</p>
                <h3 className='mt-1 text-sm font-semibold text-slate-100'>{queueItems.length} pacientes em movimento</h3>
              </div>
              <Users className='text-slate-500' size={16} />
            </div>
            <div className='mt-4 space-y-2 max-h-[300px] overflow-y-auto pr-1'>
              {queueItems.length === 0 ? (
                <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-sm text-slate-500'>Fila vazia.</div>
              ) : (
                queueItems.map((item) => (
                  <QueueCard
                    key={item.id}
                    item={item}
                    focused={selectedQueueIds.has(item.id)}
                    onFocus={() => {
                      const pickup = resolvePickupPoint(item);
                      setFocus({
                        scope: 'queue',
                        queueIds: [item.id],
                        routeId: item.routeId ?? null,
                        vehicleId: null,
                        operationId: item.operationId ?? item.routeId ?? null,
                        center: pickup ?? undefined,
                        zoom: pickup ? 16 : 13,
                        label: item.patient?.name ?? item.patientId,
                        status: item.status,
                      });
                    }}
                  />
                ))
              )}
            </div>
          </div>

          <OperationalRail queueItems={queueItems} alerts={activityFeed} vehicles={vehicles} connected={connected} />
        </aside>
      </div>
    </div>
  );
}
