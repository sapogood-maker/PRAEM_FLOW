'use client';

import { useState } from 'react';
import { QueueFilters } from '@/components/queue/QueueFilters';
import { QueueTable } from '@/components/queue/QueueTable';
import { useQueue } from '@/hooks/useQueue';
import type { QueueType } from '@/types';

export default function QueuePage() {
  const { data = [] } = useQueue();
  const [activeTab, setActiveTab] = useState<QueueType>('LOGISTICS');

  const filtered = data.filter((item) => item.queueType === activeTab);
  const tabs: { value: QueueType; label: string; icon: string }[] = [
    { value: 'LOGISTICS', label: 'Fila Logística', icon: '🚐' },
    { value: 'MEDICAL', label: 'Fila Médica', icon: '🏥' },
  ];

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Fila Operacional</h2>
          <p className='text-sm text-slate-400'>{data.length} paciente(s) na fila</p>
        </div>
        <button
          type='button'
          aria-label='Sugerir agrupamentos usando IA'
          className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium hover:bg-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 transition-colors'
        >
          🤖 IA Sugerir Agrupamentos
        </button>
      </div>

      {/* Tabs */}
      <div className='flex gap-1 rounded-lg border border-border bg-panel p-1 w-fit'>
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type='button'
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-cyan-700 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <QueueFilters />
      <QueueTable items={filtered} />
    </section>
  );
}
