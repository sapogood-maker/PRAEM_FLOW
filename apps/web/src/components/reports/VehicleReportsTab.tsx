'use client';

import { useQuery } from '@tanstack/react-query';
import { vehicleService, routeService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ReportStatCard } from './ReportStatCard';
import { getVehicleStatusLabel, getVehicleTypeLabel } from '@/lib/i18n';

interface Props {
  date: string;
}

export function VehicleReportsTab({ date }: Props) {
  const { data: vehiclesData, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['report-vehicles'],
    queryFn: () => vehicleService.list({ limit: 100 }),
    staleTime: 60_000,
  });

  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['report-routes-vehicles', date],
    queryFn: () => routeService.list({ date, limit: 200 }),
    staleTime: 60_000,
  });

  const isLoading = vehiclesLoading || routesLoading;

  if (isLoading) return <LoadingSpinner />;

  const vehicles = vehiclesData?.items ?? [];
  const routes = routesData?.items ?? [];

  const activeVehicles = vehicles.filter((v: any) => v.status === 'ON_ROUTE').length;
  const availableVehicles = vehicles.filter((v: any) => v.status === 'AVAILABLE').length;
  const maintenanceVehicles = vehicles.filter((v: any) => v.status === 'MAINTENANCE').length;
  const inactiveVehicles = vehicles.filter((v: any) => v.status === 'INACTIVE').length;

  // Build per-vehicle stats from routes
  const vehicleStats: Record<string, { operations: number; trips: number; routeIds: Set<string> }> = {};
  for (const route of routes) {
    const vehicleId = route.vehicleId ?? route.vehicle?.id;
    if (!vehicleId) continue;
    if (!vehicleStats[vehicleId]) vehicleStats[vehicleId] = { operations: 0, trips: 0, routeIds: new Set() };
    vehicleStats[vehicleId].operations += 1;
    vehicleStats[vehicleId].trips += route.trips?.length ?? route.tripCount ?? 0;
    vehicleStats[vehicleId].routeIds.add(route.id);
  }

  return (
    <div className='space-y-6'>
      <div>
        <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Frota · {date}</p>
        <h3 className='mt-1 text-xl font-semibold text-slate-100'>Relatório de Veículos</h3>
        <p className='mt-1 text-sm text-slate-400'>{vehicles.length} veículo(s) cadastrado(s)</p>
      </div>

      <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
        <ReportStatCard label='Total na Frota' value={vehicles.length} accent='slate' />
        <ReportStatCard label='Em Rota' value={activeVehicles} accent='cyan' />
        <ReportStatCard label='Disponíveis' value={availableVehicles} accent='emerald' />
        <ReportStatCard label='Em Manutenção' value={maintenanceVehicles} accent='amber' />
      </div>

      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Desempenho por Veículo · {date}</p>
        <div className='overflow-x-auto rounded-xl border border-white/5'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-[11px] text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 text-left'>Placa</th>
                <th className='p-3 text-left'>Modelo</th>
                <th className='p-3 text-left'>Tipo</th>
                <th className='p-3 text-left'>Capacidade</th>
                <th className='p-3 text-left'>Status</th>
                <th className='p-3 text-right'>Operações</th>
                <th className='p-3 text-right'>Viagens</th>
                <th className='p-3 text-left'>Acessibilidade</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v: any) => {
                const stats = vehicleStats[v.id];
                return (
                  <tr key={v.id} className='border-t border-white/5 hover:bg-white/[0.02]'>
                    <td className='p-3 font-mono font-semibold text-slate-100'>{v.plate}</td>
                    <td className='p-3 text-slate-300'>{v.model ?? '—'}</td>
                    <td className='p-3 text-slate-400 text-xs'>{getVehicleTypeLabel(v.type)}</td>
                    <td className='p-3 text-slate-400'>{v.capacity ?? '—'}</td>
                    <td className='p-3'>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        v.status === 'ON_ROUTE'
                          ? 'bg-cyan-900/60 text-cyan-300'
                          : v.status === 'AVAILABLE'
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : v.status === 'MAINTENANCE'
                          ? 'bg-amber-900/60 text-amber-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {getVehicleStatusLabel(v.status)}
                      </span>
                    </td>
                    <td className='p-3 text-right font-semibold text-slate-200'>{stats?.operations ?? 0}</td>
                    <td className='p-3 text-right text-slate-300'>{stats?.trips ?? 0}</td>
                    <td className='p-3 text-xs text-slate-500'>
                      {[v.wheelchair && 'Cadeirante', v.stretcher && 'Maca'].filter(Boolean).join(', ') || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {inactiveVehicles > 0 && (
        <p className='text-xs text-slate-500'>
          ℹ {inactiveVehicles} veículo(s) inativo(s) não contabilizado(s) nas operações.
        </p>
      )}
    </div>
  );
}
