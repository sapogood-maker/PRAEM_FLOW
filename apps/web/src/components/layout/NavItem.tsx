'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link href={href} className={cn('block rounded-lg px-3 py-2 text-sm', active ? 'bg-cyan-700 text-white' : 'text-slate-300 hover:bg-slate-800')}>
      {label}
    </Link>
  );
}
