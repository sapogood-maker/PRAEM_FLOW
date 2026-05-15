import { NAV_ITEMS } from '@/lib/constants';
import { NavItem } from './NavItem';

export function Sidebar() {
  return (
    <aside className='h-screen w-64 border-r border-border bg-panel p-4'>
      <h1 className='mb-6 text-xl font-bold'>PRAEM OPS</h1>
      <nav className='space-y-1'>
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} href={item.href} label={item.label} />
        ))}
      </nav>
    </aside>
  );
}
