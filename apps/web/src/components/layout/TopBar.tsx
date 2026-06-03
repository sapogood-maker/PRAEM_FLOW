'use client';

import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuthStore } from '@/store/auth.store';
import { useRealtimeStore } from '@/store/realtime.store';
import { useAuth } from '@/hooks/useAuth';
import { UI_TEXT } from '@/lib/ui-text';
import { Wifi, WifiOff } from 'lucide-react';

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
        <div className='flex items-center justify-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-6 py-1.5'>
          <span className='text-xs font-bold uppercase tracking-widest text-amber-300'>{UI_TEXT.topBar.homologationBanner}</span>
        </div>
      )}
      <header className='flex items-center justify-between border-b border-white/5 bg-slate-950/80 px-6 py-3 backdrop-blur-xl'>
        <div className='flex items-center gap-4'>
          <div>
            <p className='text-[11px] uppercase tracking-[0.28em] text-slate-500'>{UI_TEXT.topBar.operations}</p>
            <p className='font-semibold text-slate-100'>{tenantName || '—'}</p>
          </div>
          <div className='h-6 w-px bg-border' />
          <div>
            <p className='text-[11px] uppercase tracking-[0.28em] text-slate-500'>{UI_TEXT.topBar.liveClock}</p>
            <p className='text-sm font-medium text-cyan-300'>{now}</p>
          </div>
        </div>
        <div className='flex items-center gap-4'>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${connected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? UI_TEXT.topBar.realtimeOnline : UI_TEXT.topBar.realtimeOffline}
          </span>
          <StatusBadge label={connected ? UI_TEXT.topBar.connected : UI_TEXT.topBar.offline} active={connected} />
          <div className='text-right'>
            <p className='text-[11px] uppercase tracking-[0.28em] text-slate-500'>{UI_TEXT.topBar.operator}</p>
            <p className='text-sm text-slate-300'>{userName || '—'}</p>
          </div>
          <button
            type='button'
            onClick={logout}
            className='rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-300'
          >
            {UI_TEXT.topBar.logout}
          </button>
        </div>
      </header>
    </>
  );
}
