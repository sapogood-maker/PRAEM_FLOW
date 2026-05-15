'use client';

import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard', 'kpis'], queryFn: dashboardService.kpis, refetchInterval: 30000 });
}
