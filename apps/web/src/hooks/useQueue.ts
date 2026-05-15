'use client';

import { useQuery } from '@tanstack/react-query';
import { queueService } from '@/services/queue.service';

export function useQueue() {
  return useQuery({ queryKey: ['queue'], queryFn: queueService.list });
}
