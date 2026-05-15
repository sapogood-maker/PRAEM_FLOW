'use client';

import { QueueFilters } from '@/components/queue/QueueFilters';
import { QueueTable } from '@/components/queue/QueueTable';
import { useQueue } from '@/hooks/useQueue';

export default function QueuePage() {
  const { data = [] } = useQueue();

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-2xl font-semibold'>Fila Inteligente</h2>
        <button
          type='button'
          aria-label='Sugerir agrupamentos usando IA'
          className='rounded bg-cyan-700 px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300'
        >
          IA Sugerir Agrupamentos
        </button>
      </div>
      <QueueFilters />
      <QueueTable items={data} />
    </section>
  );
}
