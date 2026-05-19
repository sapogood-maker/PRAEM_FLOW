import { create } from 'zustand';
import type { ActivityEvent, VehiclePosition } from '@/types';

type BoardingEvent = {
  tripId: string;
  patientId: string;
  patientName?: string;
  boardedAt: string;
};

type RealtimeState = {
  connected: boolean;
  vehiclePositions: VehiclePosition[];
  activityFeed: ActivityEvent[];
  boardingEvents: BoardingEvent[];
  setConnected: (connected: boolean) => void;
  updateVehiclePosition: (pos: VehiclePosition) => void;
  pushActivity: (event: Omit<ActivityEvent, 'id'>) => void;
  pushBoardingEvent: (event: BoardingEvent) => void;
};

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  vehiclePositions: [],
  activityFeed: [],
  boardingEvents: [],

  setConnected: (connected) => set({ connected }),

  updateVehiclePosition: (pos) =>
    set((state) => {
      const others = state.vehiclePositions.filter((v) => v.vehicleId !== pos.vehicleId);
      return { vehiclePositions: [...others, pos] };
    }),

  pushActivity: (event) =>
    set((state) => {
      const entry: ActivityEvent = {
        ...event,
        id: crypto.randomUUID(),
      };
      return { activityFeed: [entry, ...state.activityFeed].slice(0, 50) };
    }),

  pushBoardingEvent: (event) =>
    set((state) => ({
      boardingEvents: [event, ...state.boardingEvents].slice(0, 100),
    })),
}));
