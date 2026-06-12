import type { LucideIcon } from 'lucide-react';
import { BellRing, ChartNoAxesCombined, Command, Settings2, Users, Route, BusFront, UserRoundCog, Upload, ListOrdered, Zap } from 'lucide-react';
import { UI_TEXT } from './ui-text';

export const APP_NAME = 'PRAEM OPS';

export type NavItemConfig = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItemConfig[] = [
  { href: '/', label: UI_TEXT.menu.operations, icon: Command },
  { href: '/operations', label: 'Operações', icon: Zap },
  { href: '/schedule', label: UI_TEXT.menu.trips, icon: Upload },
  { href: '/queue', label: UI_TEXT.menu.operationalQueue, icon: ListOrdered },
  { href: '/routes', label: UI_TEXT.menu.routes, icon: Route },
  { href: '/patients', label: UI_TEXT.menu.patients, icon: Users },
  { href: '/vehicles', label: UI_TEXT.menu.vehicles, icon: BusFront },
  { href: '/drivers', label: UI_TEXT.menu.drivers, icon: UserRoundCog },
  { href: '/replay', label: UI_TEXT.menu.alerts, icon: BellRing },
  { href: '/reports', label: UI_TEXT.menu.reports, icon: ChartNoAxesCombined },
  { href: '/admin/notification-templates', label: `${UI_TEXT.menu.settings} · ${UI_TEXT.menu.messageTemplates}`, icon: Settings2 },
];
