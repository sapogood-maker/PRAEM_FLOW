'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { Upload } from 'lucide-react';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { OperationalRail } from '@/components/dashboard/OperationalRail';
import { useDashboard } from '@/hooks/useDashboard';
import { useQueue } from '@/hooks/useQueue';
import { useRealtimeStore } from '@/store/realtime.store';
import { UI_TEXT } from '@/lib/ui-text';
import type { QueueItem, OperationalKpis } from '@/types';

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

type OperationalQueueItem = QueueItem & {
  patient?: { name?: string; mobility?: string; specialNeeds?: string | null };
  healthcareLocation?: { name?: string; city?: string; latitude?: number; longitude?: number };
  lat?: number;
  lng?: number;
  notes?: string | null;
};

type PickupPoint = {
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

export default function DashboardPage() {
  const { data } = useDashboard();
  const { data: queueData } = useQueue({ limit: 20 });
  const connected = useRealtimeStore((s) => s.connected);
  const routeOperationalStates = useRealtimeStore((s) => s.routeOperationalStates);
  const activityFeed = useRealtimeStore((s) => s.activityFeed);
  const boardingEvents = useRealtimeStore((s) => s.boardingEvents);
  const vehicles = useRealtimeStore((s) => s.vehiclePositions);

  const kpis = data ?? EMPTY_KPIS;
  const queueItems = (queueData?.items ?? []) as OperationalQueueItem[];
  const pickupPoints = useMemo(
    () =>
      queueItems
        .filter((item) => item.status !== 'CANCELLED')
        .map<PickupPoint | null>((item) => {
          const location = item.healthcareLocation;
          const lat = Number(location?.latitude ?? item.lat);
          const lng = Number(location?.longitude ?? item.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return {
            id: item.id,
            lat,
            lng,
            label: item.patient?.name ?? item.patientId,
            appointmentDate: item.appointmentDate,
            destination: location?.name ?? item.destination,
            patientName: item.patient?.name ?? item.patientId,
            status: item.status,
            priority: item.priority,
          };
        })
        .filter((point): point is PickupPoint => point !== null),
    [queueItems],
  );

  const activeRouteCount = Object.keys(routeOperationalStates).length;
  const liveSignals = activityFeed.filter((event) => event.type === 'alert').length;

  return (
    <div className='space-y-6'>
      <header className='space-y-4'>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div className='max-w-3xl'>
            <p className='text-[11px] uppercase tracking-[0.35em] text-cyan-300/70'>{UI_TEXT.dashboard.overline}</p>
            <h2 className='mt-2 text-3xl font-semibold text-slate-50'>{UI_TEXT.dashboard.title}</h2>
            <p className='mt-2 text-sm text-slate-400'>
              {UI_TEXT.dashboard.description}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2 text-xs text-slate-400'>
            <Link
              href='/schedule'
              className='inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500'
            >
              <Upload size={16} />
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

      <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]'>
        <OperationalMap pickupPoints={pickupPoints} showFleetList={false} className='h-full' />
        <div className='space-y-4'>
          <div className='rounded-[24px] border border-white/5 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-xl'>
            <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>{UI_TEXT.dashboard.activeOperations}</p>
            <div className='mt-3 grid grid-cols-2 gap-2 text-sm'>
              <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
                <p className='text-[11px] uppercase tracking-[0.25em] text-slate-500'>{UI_TEXT.dashboard.routesLive}</p>
                <p className='mt-1 text-lg font-semibold text-slate-100'>{activeRouteCount}</p>
              </div>
              <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
                <p className='text-[11px] uppercase tracking-[0.25em] text-slate-500'>{UI_TEXT.dashboard.alerts}</p>
                <p className='mt-1 text-lg font-semibold text-slate-100'>{liveSignals}</p>
              </div>
              <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
                <p className='text-[11px] uppercase tracking-[0.25em] text-slate-500'>{UI_TEXT.dashboard.inTransit}</p>
                <p className='mt-1 text-lg font-semibold text-slate-100'>{kpis.activeVehicles}</p>
              </div>
              <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
                <p className='text-[11px] uppercase tracking-[0.25em] text-slate-500'>{UI_TEXT.dashboard.waitingBoarding}</p>
                <p className='mt-1 text-lg font-semibold text-slate-100'>{kpis.waitingPatients}</p>
              </div>
            </div>
          </div>
          <OperationalRail queueItems={queueItems} alerts={activityFeed} vehicles={vehicles} connected={connected} />
        </div>
      </div>
    </div>
  );
}
