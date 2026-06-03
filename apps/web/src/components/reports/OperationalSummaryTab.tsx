'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { routeService } from '@/services/operational.service';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ReportStatCard } from './ReportStatCard';
import type { OperationalKpis } from '@/types';

interface Props {
  date: string;
}

export function OperationalSummaryTab({ date }: Props) {
  const { data: kpis, isLoading: kpisLoading } = useQuery<OperationalKpis>({
    queryKey: ['report-kpis'],
    queryFn: dashboardService.kpis,
    staleTime: 60_000,
  });

  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['report-routes-summary', date],
    queryFn: () => routeService.list({ date, limit: 200 }),
    staleTime: 60_000,
  });

  const { data: operation } = useQuery({
    queryKey: ['report-daily-op', date],
    queryFn: () => api.get('/daily-operations/today').then((r) => r.data),
    staleTime: 60_000,
  });

  const isLoading = kpisLoading || routesLoading;

  if (isLoading) return <LoadingSpinner />;

  const routes = routesData?.items ?? [];
  const completedRoutes = routes.filter((r: any) => r.status === 'COMPLETED').length;
  const activeRoutes = routes.filter((r: any) => ['ACTIVE', 'DISPATCHED', 'PREPARING', 'RETURNING'].includes(r.status)).length;
  const cancelledRoutes = routes.filter((r: any) => r.status === 'CANCELLED').length;
  const totalRoutes = routes.length;
  const estimatedKm = kpis?.estimatedKmToday ?? 0;
  const confirmationRate = kpis?.confirmationRate ?? 0;
  const absenceRate = kpis?.absenceRate ?? 0;
  const delays = kpis?.delays ?? 0;
  const absences = kpis?.absences ?? 0;
  const patientsToday = kpis?.patientsToday ?? 0;
  const completedTrips = kpis?.completedTrips ?? 0;
  const activeVehicles = kpis?.activeVehicles ?? 0;

  return (
    <div className='space-y-6'>
      <div>
        <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Visão Geral · {date}</p>
        <h3 className='mt-1 text-xl font-semibold text-slate-100'>Resumo Operacional do Dia</h3>
        {operation?.date && (
          <p className='mt-1 text-sm text-slate-400'>
            Operação:{' '}
            <span className='text-slate-200 font-medium'>
              {new Date(operation.date).toLocaleDateString('pt-BR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </p>
        )}
      </div>

      {/* Primary KPIs */}
      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Transporte de Pacientes</p>
        <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
          <ReportStatCard label='Pacientes Hoje' value={patientsToday} accent='cyan' />
          <ReportStatCard label='Viagens Concluídas' value={completedTrips} accent='emerald' />
          <ReportStatCard label='Ausências Registradas' value={absences} accent='amber' />
          <ReportStatCard
            label='Taxa de Confirmação'
            value={`${confirmationRate.toFixed(1)}%`}
            accent={confirmationRate >= 80 ? 'emerald' : 'amber'}
          />
        </div>
      </div>

      {/* Routes */}
      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Execução de Rotas</p>
        <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
          <ReportStatCard label='Total de Rotas' value={totalRoutes} accent='slate' />
          <ReportStatCard label='Rotas Concluídas' value={completedRoutes} accent='emerald' />
          <ReportStatCard label='Rotas Ativas' value={activeRoutes} accent='cyan' />
          <ReportStatCard label='Rotas Canceladas' value={cancelledRoutes} accent='rose' />
        </div>
      </div>

      {/* Fleet & Logistics */}
      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Frota e Logística</p>
        <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
          <ReportStatCard label='Veículos Ativos' value={activeVehicles} accent='cyan' />
          <ReportStatCard label='KM Estimados' value={`${estimatedKm} km`} accent='indigo' />
          <ReportStatCard label='Atrasos Detectados' value={delays} accent={delays > 0 ? 'amber' : 'emerald'} />
          <ReportStatCard
            label='Taxa de Ausência'
            value={`${absenceRate.toFixed(1)}%`}
            accent={absenceRate > 15 ? 'rose' : 'slate'}
          />
        </div>
      </div>

      {/* Routes table */}
      {routes.length > 0 && (
        <div>
          <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Detalhe das Rotas</p>
          <div className='overflow-x-auto rounded-xl border border-white/5'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-900 text-[11px] text-slate-400 uppercase tracking-wider'>
                <tr>
                  <th className='p-3 text-left'>Rota</th>
                  <th className='p-3 text-left'>Motorista</th>
                  <th className='p-3 text-left'>Veículo</th>
                  <th className='p-3 text-left'>Viagens</th>
                  <th className='p-3 text-left'>Status</th>
                  <th className='p-3 text-left'>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {routes.slice(0, 30).map((r: any) => (
                  <tr key={r.id} className='border-t border-white/5 hover:bg-white/[0.02]'>
                    <td className='p-3 text-slate-200 font-medium'>{r.name ?? r.id.slice(0, 8)}</td>
                    <td className='p-3 text-slate-400'>{r.driver?.name ?? '—'}</td>
                    <td className='p-3 text-slate-400'>{r.vehicle?.plate ?? '—'}</td>
                    <td className='p-3 text-slate-300'>{r.trips?.length ?? r.tripCount ?? 0}</td>
                    <td className='p-3'>
                      <span className='rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300'>
                        {r.status}
                      </span>
                    </td>
                    <td className='p-3 text-slate-500 text-xs'>{r.dispatchType ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
