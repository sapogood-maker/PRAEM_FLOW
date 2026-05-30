'use client';

import { useQueueStore } from '@/store/queue.store';

export function QueueFilters() {
  const setFilters = useQueueStore((s) => s.setFilters);

  return (
    <div className='grid gap-2 rounded-xl border border-border bg-panel p-4 md:grid-cols-4'>
      <input
        type='date'
        aria-label='Filtro por data'
        className='rounded bg-slate-900 p-2'
        placeholder='Data'
        onChange={(e) => setFilters({ date: e.target.value })}
      />
      <select
        aria-label='Filtro por prioridade'
        className='rounded bg-slate-900 p-2'
        onChange={(e) => setFilters({ priority: e.target.value })}
      >
        <option value=''>Prioridade</option>
        <option value='CRITICAL'>Crítica</option>
        <option value='HIGH'>Alta</option>
        <option value='NORMAL'>Normal</option>
        <option value='PENDING'>Pendente</option>
      </select>
      <select
        aria-label='Filtro por status'
        className='rounded bg-slate-900 p-2'
        onChange={(e) => setFilters({ status: e.target.value })}
      >
        <option value=''>Status</option>
        <option value='WAITING'>Aguardando</option>
        <option value='ASSIGNED'>Atribuído</option>
        <option value='CONFIRMED'>Confirmado</option>
        <option value='CANCELLED'>Cancelado</option>
      </select>
      <input aria-label='Filtro por destino' className='rounded bg-slate-900 p-2' placeholder='Destino' onChange={(e) => setFilters({ destination: e.target.value })} />
    </div>
  );
}
