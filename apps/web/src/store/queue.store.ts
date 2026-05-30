import { create } from 'zustand';
import { QueueItem } from '@/types';

type QueueState = {
  filters: { date?: string; priority?: string; status?: string; destination?: string };
  setFilters: (value: QueueState['filters']) => void;
  queue: QueueItem[];
  setQueue: (items: QueueItem[]) => void;
};

export const useQueueStore = create<QueueState>((set) => ({
  filters: {},
  queue: [],
  setFilters: (filters) => set({ filters }),
  setQueue: (queue) => set({ queue }),
}));
