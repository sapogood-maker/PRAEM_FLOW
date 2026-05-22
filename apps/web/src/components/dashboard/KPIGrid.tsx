import { KPICard } from './KPICard';
import type { OperationalKpis } from '@/types';

interface KPIGridProps {
  kpis: OperationalKpis;
}

export function KPIGrid({ kpis }: KPIGridProps) {
  return (
    <div className='space-y-4'>
      {/* Row 1 — Volume */}
      <div className='grid gap-3 grid-cols-2 md:grid-cols-5'>
        <KPICard icon='🚑' title='Pacientes Hoje' value={kpis.patientsToday} accent='info' />
        <KPICard icon='⏳' title='Aguardando' value={kpis.waitingPatients} accent='warning' />
        <KPICard icon='🟢' title='Embarcados' value={kpis.boardedPatients} accent='ok' />
        <KPICard icon='🔴' title='Críticos' value={kpis.criticalPatients} accent='critical' />
        <KPICard icon='✅' title='Viagens Concluídas' value={kpis.completedTrips} accent='ok' />
      </div>
      {/* Row 2 — Operação */}
      <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
        <KPICard icon='🗺️' title='Rotas Ativas' value={kpis.activeRoutes} accent='info' />
        <KPICard icon='🚌' title='Veículos Ativos' value={kpis.activeVehicles} accent='info' />
        <KPICard icon='💺' title='Ocupação Média' value={kpis.averageOccupancy} unit='%' accent={kpis.averageOccupancy >= 70 ? 'ok' : 'warning'} />
        <KPICard icon='📍' title='Km Estimado' value={kpis.estimatedKmToday} unit='km' accent='default' />
      </div>
      {/* Row 3 — Qualidade */}
      <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
        <KPICard icon='📞' title='Taxa Confirmação' value={kpis.confirmationRate} unit='%' accent={kpis.confirmationRate >= 80 ? 'ok' : 'warning'} />
        <KPICard icon='❌' title='Faltas' value={kpis.absences} accent={kpis.absences > 5 ? 'critical' : 'warning'} />
        <KPICard icon='⚠️' title='Inacessíveis' value={kpis.unreachablePatients} accent={kpis.unreachablePatients > 3 ? 'critical' : 'warning'} />
        <KPICard icon='🚫' title='Viagens Vazias' value={kpis.emptyTrips} accent={kpis.emptyTrips > 0 ? 'warning' : 'ok'} />
      </div>
    </div>
  );
}
