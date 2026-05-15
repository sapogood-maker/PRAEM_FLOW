'use client';

import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import dynamic from 'next/dynamic';
import { useDashboard } from '@/hooks/useDashboard';

const OperationalMap = dynamic(() => import('@/components/map/OperationalMap'), { ssr: false });

export default function DashboardPage() {
  const { data } = useDashboard();

  return (
    <div className='space-y-6'>
      <KPIGrid
        kpis={
          data ?? {
            patientsToday: 0,
            activeRoutes: 0,
            averageOccupancy: 0,
            absences: 0,
            delays: 0,
            activeVehicles: 0,
            completedTrips: 0,
            waitingPatients: 0,
          }
        }
      />
      <div className='grid gap-6 xl:grid-cols-2'>
        <OperationalMap />
        <ActivityFeed />
      </div>
    </div>
  );
}
