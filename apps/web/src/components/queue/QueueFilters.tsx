'use client';

import { useQueueStore } from '@/store/queue.store';

export function QueueFilters() {
  const setFilters = useQueueStore((s) => s.setFilters);

  return (
    <div className='grid gap-2 rounded-xl border border-border bg-panel p-4 md:grid-cols-4'>
      <input className='rounded bg-slate-900 p-2' placeholder='Data' onChange={(e) => setFilters({ destination: e.target.value })} />
      <input className='rounded bg-slate-900 p-2' placeholder='Prioridade' onChange={(e) => setFilters({ priority: e.target.value })} />
      <input className='rounded bg-slate-900 p-2' placeholder='Status' onChange={(e) => setFilters({ status: e.target.value })} />
      <input className='rounded bg-slate-900 p-2' placeholder='Destino' onChange={(e) => setFilters({ destination: e.target.value })} />
    </div>
  );
}
