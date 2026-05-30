'use client';

import { useQuery } from '@tanstack/react-query';
import { driverService, routeService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ReportStatCard } from './ReportStatCard';

interface Props {
  date: string;
}

export function DriverReportsTab({ date }: Props) {
  const { data: driversData, isLoading: driversLoading } = useQuery({
    queryKey: ['report-drivers'],
    queryFn: () => driverService.list({ limit: 100 }),
    staleTime: 60_000,
  });

  const { data: onlineData, isLoading: onlineLoading } = useQuery({
    queryKey: ['report-drivers-online'],
    queryFn: driverService.online,
    staleTime: 60_000,
  });

  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['report-routes-drivers', date],
    queryFn: () => routeService.list({ date, limit: 200 }),
    staleTime: 60_000,
  });

  const isLoading = driversLoading || routesLoading || onlineLoading;

  if (isLoading) return <LoadingSpinner />;

  const drivers = driversData?.items ?? [];
  const routes = routesData?.items ?? [];
  const onlineDrivers: any[] = Array.isArray(onlineData) ? onlineData : (onlineData?.items ?? []);

  const onlineSet = new Set(onlineDrivers.map((d: any) => d.id));

  const activeDrivers = drivers.filter((d: any) => d.active).length;
  const onlineCount = onlineDrivers.length;

  // Build per-driver stats from routes
  const driverStats: Record<string, { routesAssigned: number; routesCompleted: number; trips: number }> = {};
  for (const route of routes) {
    const driverId = route.driverId ?? route.driver?.id;
    if (!driverId) continue;
    if (!driverStats[driverId]) driverStats[driverId] = { routesAssigned: 0, routesCompleted: 0, trips: 0 };
    driverStats[driverId].routesAssigned += 1;
    if (route.status === 'COMPLETED') driverStats[driverId].routesCompleted += 1;
    driverStats[driverId].trips += route.trips?.length ?? route.tripCount ?? 0;
  }

  const driversWithRoutes = drivers.filter((d: any) => driverStats[d.id]?.routesAssigned > 0);
  const driversWithoutRoutes = drivers.filter((d: any) => d.active && !driverStats[d.id]);

  return (
    <div className='space-y-6'>
      <div>
        <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Motoristas · {date}</p>
        <h3 className='mt-1 text-xl font-semibold text-slate-100'>Relatório de Motoristas</h3>
        <p className='mt-1 text-sm text-slate-400'>{drivers.length} motorista(s) cadastrado(s)</p>
      </div>

      <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
        <ReportStatCard label='Total Cadastrados' value={drivers.length} accent='slate' />
        <ReportStatCard label='Ativos' value={activeDrivers} accent='emerald' />
        <ReportStatCard label='Online Agora' value={onlineCount} accent='cyan' />
        <ReportStatCard label='Com Rotas Hoje' value={driversWithRoutes.length} accent='indigo' />
      </div>

      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Produtividade por Motorista · {date}</p>
        <div className='overflow-x-auto rounded-xl border border-white/5'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-[11px] text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 text-left'>Motorista</th>
                <th className='p-3 text-left'>Situação</th>
                <th className='p-3 text-right'>Rotas Atrib.</th>
                <th className='p-3 text-right'>Concluídas</th>
                <th className='p-3 text-right'>Viagens</th>
                <th className='p-3 text-right'>Taxa Conclusão</th>
              </tr>
            </thead>
            <tbody>
              {drivers
                .filter((d: any) => d.active)
                .sort((a: any, b: any) => (driverStats[b.id]?.routesAssigned ?? 0) - (driverStats[a.id]?.routesAssigned ?? 0))
                .map((d: any) => {
                  const stats = driverStats[d.id];
                  const assigned = stats?.routesAssigned ?? 0;
                  const completed = stats?.routesCompleted ?? 0;
                  const trips = stats?.trips ?? 0;
                  const rate = assigned > 0 ? Math.round((completed / assigned) * 100) : null;
                  const isOnline = onlineSet.has(d.id);
                  return (
                    <tr key={d.id} className='border-t border-white/5 hover:bg-white/[0.02]'>
                      <td className='p-3'>
                        <span className='font-medium text-slate-100'>{d.name}</span>
                      </td>
                      <td className='p-3'>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          isOnline
                            ? 'bg-emerald-900/60 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {isOnline ? '● Online' : '○ Offline'}
                        </span>
                      </td>
                      <td className='p-3 text-right text-slate-300 font-semibold'>{assigned}</td>
                      <td className='p-3 text-right text-emerald-400'>{completed}</td>
                      <td className='p-3 text-right text-slate-400'>{trips}</td>
                      <td className='p-3 text-right'>
                        {rate !== null ? (
                          <span className={`font-semibold ${rate === 100 ? 'text-emerald-400' : rate >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {rate}%
                          </span>
                        ) : (
                          <span className='text-slate-600'>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {driversWithoutRoutes.length > 0 && (
        <div className='rounded-xl border border-white/5 bg-white/5 p-4'>
          <p className='text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2'>
            Motoristas Sem Rotas Hoje ({driversWithoutRoutes.length})
          </p>
          <div className='flex flex-wrap gap-2'>
            {driversWithoutRoutes.map((d: any) => (
              <span key={d.id} className='rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400'>
                {d.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
