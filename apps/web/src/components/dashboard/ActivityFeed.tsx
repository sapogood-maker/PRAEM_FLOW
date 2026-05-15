import { Card } from '@/components/ui/card';

const events = ['Rota #R-102 iniciada', 'Paciente P-332 confirmado', 'Veículo V-09 em deslocamento'];

export function ActivityFeed() {
  return (
    <Card>
      <h3 className='mb-3 text-lg font-semibold'>Atividade em tempo real</h3>
      <ul className='space-y-2 text-sm text-slate-300'>
        {events.map((event) => (
          <li key={event} className='rounded-lg bg-slate-900 p-2'>
            {event}
          </li>
        ))}
      </ul>
    </Card>
  );
}
