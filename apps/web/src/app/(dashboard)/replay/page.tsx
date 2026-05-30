'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { routeService, trackingService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const RouteReplayPanel = dynamic(() => import('@/components/replay/RouteReplayPanel'), { ssr: false });

export default function ReplayPage() {
  const searchParams = useSearchParams();
  const [routeId, setRouteId] = useState('');

  useEffect(() => {
    const requested = searchParams.get('routeId');
    if (requested) setRouteId(requested);
  }, [searchParams]);

  const routesQuery = useQuery({
    queryKey: ['routes-for-replay'],
    queryFn: () => routeService.list({ limit: 200 }),
  });

  const routeItems = useMemo(() => routesQuery.data?.items ?? [], [routesQuery.data]);

  const replayQuery = useQuery({
    queryKey: ['tracking-replay', routeId],
    queryFn: () => trackingService.replay(routeId, 3500),
    enabled: !!routeId,
  });

  return (
    <section className='space-y-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Replay Operacional de Rotas</h2>
          <p className='text-sm text-slate-400'>Reconstrução histórica com trilha GPS, timeline e auditoria operacional.</p>
        </div>
      </div>

      <div className='rounded-xl border border-border bg-panel p-4'>
        <label className='text-xs uppercase tracking-wider text-slate-500'>Selecione a rota</label>
        <select
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
          className='mt-2 w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm text-slate-100'
        >
          <option value=''>Selecione...</option>
          {routeItems.map((r: any) => (
            <option key={r.id} value={r.id}>
              {new Date(r.date ?? r.createdAt).toLocaleDateString('pt-BR')} · {r.origin ?? 'Origem'} → {r.destination ?? 'Destino'} · {r.vehicle?.plate ?? 'sem placa'}
            </option>
          ))}
        </select>
      </div>

      {(routesQuery.isLoading || replayQuery.isLoading) && <LoadingSpinner />}

      {routeId && replayQuery.data && <RouteReplayPanel data={replayQuery.data} />}
    </section>
  );
}
