import type { LucideIcon } from 'lucide-react';
import { BellRing, ChartNoAxesCombined, Command, Settings2, Users, Route, BusFront, UserRoundCog, Upload } from 'lucide-react';
import { UI_TEXT } from './ui-text';

export const APP_NAME = 'PRAEM OPS';

export type NavItemConfig = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItemConfig[] = [
  { href: '/', label: UI_TEXT.menu.operations, icon: Command },
  { href: '/schedule', label: UI_TEXT.menu.trips, icon: Upload },
  { href: '/routes', label: UI_TEXT.menu.routes, icon: Route },
  { href: '/patients', label: UI_TEXT.menu.patients, icon: Users },
  { href: '/vehicles', label: UI_TEXT.menu.vehicles, icon: BusFront },
  { href: '/drivers', label: UI_TEXT.menu.drivers, icon: UserRoundCog },
  { href: '/replay', label: UI_TEXT.menu.alerts, icon: BellRing },
  { href: '/daily-op', label: UI_TEXT.menu.reports, icon: ChartNoAxesCombined },
  { href: '/admin/whatsapp', label: UI_TEXT.menu.settings, icon: Settings2 },
];
