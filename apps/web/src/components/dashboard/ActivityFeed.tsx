'use client';

import { Card } from '@/components/ui/card';
import { useRealtimeStore } from '@/store/realtime.store';

const typeIcons: Record<string, string> = {
  route: '🗺️',
  trip: '🚐',
  queue: '📋',
  vehicle: '🚌',
  kpi: '📊',
  alert: '⚠️',
  boarding: '🧍',
  ops: '🧭',
  replay: '⏯️',
  recovery: '♻️',
  websocket: '🔌',
};

export function ActivityFeed() {
  const feed = useRealtimeStore((s) => s.activityFeed);
  const connected = useRealtimeStore((s) => s.connected);

  const display = feed.length > 0 ? feed : [
    { id: '1', message: 'Aguardando eventos em tempo real…', type: 'kpi' as const, timestamp: new Date().toISOString() },
  ];

  return (
    <Card>
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-base font-semibold'>Atividade em Tempo Real</h3>
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
      </div>
      <ul className='space-y-1 text-sm max-h-[420px] overflow-y-auto pr-1'>
        {display.map((event) => (
          <li key={event.id} className='flex items-start gap-2 rounded-md bg-slate-900 px-3 py-2'>
            <span>{typeIcons[event.type] ?? '●'}</span>
            <span className='flex-1 text-slate-300'>{event.message}</span>
            <span className='shrink-0 text-xs text-slate-500'>
              {new Date(event.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
