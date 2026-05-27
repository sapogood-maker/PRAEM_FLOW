import { Activity, AlertTriangle, BusFront, Users } from 'lucide-react';
import { KPICard } from './KPICard';
import type { OperationalKpis } from '@/types';

interface KPIGridProps {
  kpis: OperationalKpis;
}

export function KPIGrid({ kpis }: KPIGridProps) {
  const criticalAlerts = kpis.criticalPatients + kpis.delays + kpis.unreachablePatients;

  return (
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
      <KPICard icon={<Activity size={16} />} title='Operations Today' value={kpis.patientsToday} accent='info' />
      <KPICard icon={<BusFront size={16} />} title='Vehicles in Transit' value={kpis.activeVehicles} accent='ok' />
      <KPICard icon={<Users size={16} />} title='Waiting Patients' value={kpis.waitingPatients} accent='warning' />
      <KPICard icon={<AlertTriangle size={16} />} title='Critical Alerts' value={criticalAlerts} accent={criticalAlerts > 0 ? 'critical' : 'default'} />
    </div>
  );
}
