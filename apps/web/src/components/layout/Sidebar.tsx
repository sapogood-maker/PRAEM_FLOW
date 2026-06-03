import { NAV_ITEMS } from '@/lib/constants';
import { UI_TEXT } from '@/lib/ui-text';
import { NavItem } from './NavItem';
import { AppWindow } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className='flex h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-slate-950/95 px-3 py-4 backdrop-blur-xl'>
      <div className='mb-6 flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
        <div className='flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300'>
          <AppWindow size={18} />
        </div>
        <div>
          <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>PRAEM OPS</p>
          <p className='text-sm font-semibold text-slate-100'>{UI_TEXT.sidebar.subtitle}</p>
        </div>
      </div>
      <nav className='space-y-1'>
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} icon={item.icon} />
        ))}
      </nav>
    </aside>
  );
}
