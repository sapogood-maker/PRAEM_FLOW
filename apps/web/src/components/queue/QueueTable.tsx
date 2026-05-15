import { PriorityBadge } from './PriorityBadge';
import type { QueueItem } from '@/types';

const confirmationLabel: Record<string, { label: string; cls: string }> = {
  PENDING:                      { label: 'Pendente',   cls: 'text-amber-400' },
  CONFIRMED:                    { label: 'Confirmado', cls: 'text-emerald-400' },
  CANCELED:                     { label: 'Cancelado',  cls: 'text-red-400' },
  UNREACHABLE:                  { label: 'Inacessível',cls: 'text-red-500' },
  WAITING_MANUAL_CONFIRMATION:  { label: 'Manual',     cls: 'text-slate-400' },
};

export function QueueTable({ items }: { items: QueueItem[] }) {
  const maskIdentifier = (value: string) =>
    value.length <= 4 ? value : `${value.slice(0, 2)}***${value.slice(-2)}`;

  return (
    <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
      <table className='w-full text-sm' aria-label='Tabela de fila de pacientes'>
        <caption className='sr-only'>Tabela de fila de pacientes por prioridade e status</caption>
        <thead className='bg-slate-900 text-xs text-slate-400 uppercase tracking-wider'>
          <tr>
            <th className='p-3 text-left'>Paciente</th>
            <th className='p-3 text-left'>Destino</th>
            <th className='p-3 text-left'>Prioridade</th>
            <th className='p-3 text-left'>Confirmação</th>
            <th className='p-3 text-left'>Acomp.</th>
            <th className='p-3 text-left'>Recorrência</th>
            <th className='p-3 text-left'>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className='p-6 text-center text-slate-500'>Nenhum paciente nesta fila</td>
            </tr>
          )}
          {items.map((item) => {
            const conf = confirmationLabel[item.confirmationStatus] ?? { label: item.confirmationStatus, cls: 'text-slate-400' };
            return (
              <tr key={item.id} className='border-t border-border hover:bg-slate-900/40 transition-colors'>
                <td className='p-3 font-mono text-xs'>{maskIdentifier(item.patientId)}</td>
                <td className='p-3 max-w-[160px] truncate'>{item.destination}</td>
                <td className='p-3'><PriorityBadge priority={item.priority} /></td>
                <td className={`p-3 text-xs font-medium ${conf.cls}`}>{conf.label}</td>
                <td className='p-3 text-center'>{item.requiresCompanion ? '👥' : '—'}</td>
                <td className='p-3 text-xs text-slate-400'>{item.recurrenceType ?? '—'}</td>
                <td className='p-3 text-xs'>{item.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
