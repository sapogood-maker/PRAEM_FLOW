'use client';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuthStore } from '@/store/auth.store';
import { useRealtimeStore } from '@/store/realtime.store';

export function TopBar() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const userName = useAuthStore((s) => s.userName);
  const connected = useRealtimeStore((s) => s.connected);
  const now = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <header className='flex items-center justify-between border-b border-border bg-panel px-6 py-3'>
      <div className='flex items-center gap-4'>
        <div>
          <p className='text-xs text-slate-500 uppercase tracking-wider'>Prefeitura</p>
          <p className='font-semibold text-slate-100'>{tenantName || '—'}</p>
        </div>
        <div className='h-6 w-px bg-border' />
        <div>
          <p className='text-xs text-slate-500 uppercase tracking-wider'>Turno</p>
          <p className='text-sm font-medium text-cyan-400'>{now}</p>
        </div>
      </div>
      <div className='flex items-center gap-4'>
        <StatusBadge label={connected ? '● Conectado' : '○ Offline'} active={connected} />
        <div className='text-right'>
          <p className='text-xs text-slate-500'>Operador</p>
          <p className='text-sm text-slate-300'>{userName || '—'}</p>
        </div>
      </div>
    </header>
  );
}
