'use client';

import { useQuery } from '@tanstack/react-query';
import { queueService } from '@/services/queue.service';
import type { QueueItem } from '@/types';

export function useQueue() {
  return useQuery<QueueItem[]>({ queryKey: ['queue'], queryFn: queueService.list });
}
