import { PriorityBadge } from './PriorityBadge';
import { QueueItem } from '@/types';

export function QueueTable({ items }: { items: QueueItem[] }) {
  const maskIdentifier = (value: string) =>
    value.length <= 4 ? value : `${value.slice(0, 2)}***${value.slice(-2)}`;

  return (
    <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
      <table className='w-full text-sm' aria-label='Tabela de fila de pacientes'>
        <caption className='sr-only'>Tabela de fila de pacientes por prioridade e status</caption>
        <thead className='bg-slate-900 text-slate-300'>
          <tr>
            <th className='p-3 text-left'>Paciente</th>
            <th className='p-3 text-left'>Destino</th>
            <th className='p-3 text-left'>Prioridade</th>
            <th className='p-3 text-left'>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className='border-t border-border'>
              <td className='p-3'>{maskIdentifier(item.patientId)}</td>
              <td className='p-3'>{item.destination}</td>
              <td className='p-3'><PriorityBadge priority={item.priority} /></td>
              <td className='p-3'>{item.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
