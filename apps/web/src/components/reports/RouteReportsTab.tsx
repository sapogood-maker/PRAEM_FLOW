'use client';

import { useQuery } from '@tanstack/react-query';
import { routeService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ReportStatCard } from './ReportStatCard';
import { getRouteStatusLabel } from '@/lib/i18n';

interface Props {
  date: string;
}

const ROUTE_STATUS_BADGE: Record<string, string> = {
  COMPLETED: 'bg-emerald-900/60 text-emerald-300',
  ACTIVE: 'bg-cyan-900/60 text-cyan-300',
  DISPATCHED: 'bg-cyan-900/40 text-cyan-400',
  PREPARING: 'bg-amber-900/60 text-amber-300',
  RETURNING: 'bg-indigo-900/60 text-indigo-300',
  CANCELLED: 'bg-rose-900/60 text-rose-300',
  SCHEDULED: 'bg-indigo-900/40 text-indigo-400',
  PENDING: 'bg-slate-800 text-slate-400',
};

export function RouteReportsTab({ date }: Props) {
  const { data: routesData, isLoading } = useQuery({
    queryKey: ['report-routes-detail', date],
    queryFn: () => routeService.list({ date, limit: 200 }),
    staleTime: 60_000,
  });

  if (isLoading) return <LoadingSpinner />;

  const routes = routesData?.items ?? [];
  const completed = routes.filter((r: any) => r.status === 'COMPLETED').length;
  const active = routes.filter((r: any) => ['ACTIVE', 'DISPATCHED', 'PREPARING', 'RETURNING'].includes(r.status)).length;
  const cancelled = routes.filter((r: any) => r.status === 'CANCELLED').length;
  const scheduled = routes.filter((r: any) => r.status === 'SCHEDULED').length;

  const totalTrips = routes.reduce((sum: number, r: any) => sum + (r.trips?.length ?? r.tripCount ?? 0), 0);
  const avgTripsPerRoute = routes.length > 0 ? (totalTrips / routes.length).toFixed(1) : '0';

  return (
    <div className='space-y-6'>
      <div>
        <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Rotas · {date}</p>
        <h3 className='mt-1 text-xl font-semibold text-slate-100'>Relatório de Rotas</h3>
        <p className='mt-1 text-sm text-slate-400'>{routes.length} rota(s) para a data selecionada</p>
      </div>

      <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
        <ReportStatCard label='Total de Rotas' value={routes.length} accent='slate' />
        <ReportStatCard label='Concluídas' value={completed} accent='emerald' />
        <ReportStatCard label='Em Andamento' value={active} accent='cyan' />
        <ReportStatCard label='Canceladas' value={cancelled} accent='rose' />
      </div>

      <div className='grid gap-3 grid-cols-2 md:grid-cols-3'>
        <ReportStatCard label='Total de Viagens' value={totalTrips} accent='indigo' />
        <ReportStatCard label='Média Viagens/Rota' value={avgTripsPerRoute} accent='indigo' />
        <ReportStatCard label='Agendadas' value={scheduled} accent='amber' />
      </div>

      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Detalhamento por Rota</p>
        {routes.length === 0 ? (
          <div className='rounded-xl border border-white/5 bg-white/5 p-8 text-center'>
            <p className='text-slate-400'>Nenhuma rota encontrada para {date}.</p>
            <p className='mt-1 text-xs text-slate-600'>Verifique se a data selecionada está correta.</p>
          </div>
        ) : (
          <div className='overflow-x-auto rounded-xl border border-white/5'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-900 text-[11px] text-slate-400 uppercase tracking-wider'>
                <tr>
                  <th className='p-3 text-left'>Nome</th>
                  <th className='p-3 text-left'>Motorista</th>
                  <th className='p-3 text-left'>Veículo</th>
                  <th className='p-3 text-left'>Status</th>
                  <th className='p-3 text-left'>Tipo</th>
                  <th className='p-3 text-right'>Viagens</th>
                  <th className='p-3 text-left'>Destino</th>
                  <th className='p-3 text-left'>Horário</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r: any) => (
                  <tr key={r.id} className='border-t border-white/5 hover:bg-white/[0.02]'>
                    <td className='p-3 font-medium text-slate-100'>{r.name ?? r.id.slice(0, 8)}</td>
                    <td className='p-3 text-slate-400'>{r.driver?.name ?? '—'}</td>
                    <td className='p-3 font-mono text-slate-400'>{r.vehicle?.plate ?? '—'}</td>
                    <td className='p-3'>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROUTE_STATUS_BADGE[r.status] ?? 'bg-slate-800 text-slate-400'}`}>
                        {getRouteStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className='p-3 text-slate-500 text-xs'>{r.dispatchType === 'SCHEDULED' ? 'Agendado' : 'Imediato'}</td>
                    <td className='p-3 text-right text-slate-300'>{r.trips?.length ?? r.tripCount ?? 0}</td>
                    <td className='p-3 text-slate-400 text-xs max-w-[180px] truncate'>{r.destination ?? r.healthcareLocation?.name ?? '—'}</td>
                    <td className='p-3 text-slate-500 text-xs whitespace-nowrap'>
                      {r.scheduledAt
                        ? new Date(r.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        : r.createdAt
                        ? new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
