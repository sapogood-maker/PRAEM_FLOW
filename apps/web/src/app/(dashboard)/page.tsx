'use client';

import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import dynamic from 'next/dynamic';
import { useDashboard } from '@/hooks/useDashboard';
import type { OperationalKpis } from '@/types';

const OperationalMap = dynamic(() => import('@/components/map/OperationalMap'), { ssr: false });

const EMPTY_KPIS: OperationalKpis = {
  patientsToday: 0,
  waitingPatients: 0,
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

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Command Center</h2>
          <p className='text-sm text-slate-400'>Central Operacional Logística · Transporte SUS</p>
        </div>
      </div>

      {/* KPIs */}
      <KPIGrid kpis={data ?? EMPTY_KPIS} />

      {/* Map + Activity */}
      <div className='grid gap-6 xl:grid-cols-[1fr_380px]'>
        <OperationalMap />
        <ActivityFeed />
      </div>
    </div>
  );
}
