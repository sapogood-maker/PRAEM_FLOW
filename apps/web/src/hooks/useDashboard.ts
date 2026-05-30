'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import type { OperationalKpis } from '@/types';

export function useDashboard() {
  return useQuery<OperationalKpis>({ queryKey: ['dashboard', 'kpis'], queryFn: dashboardService.kpis, refetchInterval: 30000 });
}
