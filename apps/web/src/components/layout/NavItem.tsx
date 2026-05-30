'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-white/10 text-white ring-1 ring-white/10'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/5 text-slate-500 group-hover:text-slate-200',
        )}
      >
        <Icon size={16} />
      </span>
      <span className='font-medium'>{label}</span>
    </Link>
  );
}
