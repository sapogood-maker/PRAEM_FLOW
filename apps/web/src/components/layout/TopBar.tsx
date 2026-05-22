'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuthStore } from '@/store/auth.store';
import { useRealtimeStore } from '@/store/realtime.store';
import { useAuth } from '@/hooks/useAuth';

export function TopBar() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const userName = useAuthStore((s) => s.userName);
  const connected = useRealtimeStore((s) => s.connected);
  const { logout } = useAuth();
  const [now, setNow] = useState<string>('--/--/---- --:--');
  const isHomolog = tenantName?.toUpperCase().includes('HOMOLOG');

  useEffect(() => {
    setNow(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));
    console.debug('[REACT] TopBar mounted');
    return () => {
      console.debug('[REACT] TopBar unmounted');
    };
  }, []);

  return (
    <>
      {isHomolog && (
        <div className='flex items-center justify-center gap-2 bg-amber-500/10 border-b border-amber-500/30 px-6 py-1.5'>
          <span className='text-xs font-bold uppercase tracking-widest text-amber-400'>⚠ HOMOLOGAÇÃO OPERACIONAL — Dados fictícios · Ambiente de testes</span>
        </div>
      )}
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
          <StatusBadge label={connected ? 'WS CONNECTED' : 'WS DISCONNECTED'} active={connected} />
          <div className='text-right'>
            <p className='text-xs text-slate-500'>Operador</p>
            <p className='text-sm text-slate-300'>{userName || '—'}</p>
          </div>
          <button
            type='button'
            onClick={logout}
            className='rounded-lg border border-border px-3 py-1.5 text-xs text-slate-400 hover:border-red-800 hover:text-red-400 transition-colors'
          >
            Sair
          </button>
        </div>
      </header>
    </>
  );
}
