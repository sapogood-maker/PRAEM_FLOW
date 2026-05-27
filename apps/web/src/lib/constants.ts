import type { LucideIcon } from 'lucide-react';
import { BellRing, ChartNoAxesCombined, Command, Settings2, Users, Route, BusFront, UserRoundCog } from 'lucide-react';

export const APP_NAME = 'PRAEM OPS';

export type NavItemConfig = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItemConfig[] = [
  { href: '/', label: 'Operations', icon: Command },
  { href: '/trips', label: 'Trips', icon: Route },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/vehicles', label: 'Vehicles', icon: BusFront },
  { href: '/drivers', label: 'Drivers', icon: UserRoundCog },
  { href: '/replay', label: 'Alerts', icon: BellRing },
  { href: '/daily-op', label: 'Reports', icon: ChartNoAxesCombined },
  { href: '/admin/whatsapp', label: 'Settings', icon: Settings2 },
];
