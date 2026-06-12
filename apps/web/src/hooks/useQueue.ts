'use client';

import { useQuery } from '@tanstack/react-query';
import { queueService } from '@/services/queue.service';

export function useQueue(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['queue', params],
    queryFn: () => queueService.list(params),
    refetchInterval: 15000,
  });
}

