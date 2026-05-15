'use client';

import { StatusBadge } from '@/components/shared/StatusBadge';
import { useAuthStore } from '@/store/auth.store';

export function TopBar() {
  const tenantName = useAuthStore((s) => s.tenantName);
  const userName = useAuthStore((s) => s.userName);

  return (
    <header className='flex items-center justify-between border-b border-border bg-panel px-6 py-4'>
      <div>
        <p className='text-sm text-slate-400'>Tenant</p>
        <p className='font-semibold'>{tenantName}</p>
      </div>
      <div className='flex items-center gap-3'>
        <StatusBadge label='Sistema Operacional' active />
        <span className='text-sm text-slate-300'>{userName}</span>
      </div>
    </header>
  );
}
