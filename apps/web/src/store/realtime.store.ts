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
  revision: number;
  vehiclePositions: VehiclePosition[];
  activityFeed: ActivityEvent[];
  boardingEvents: BoardingEvent[];
  setConnected: (connected: boolean) => void;
  bumpRevision: () => void;
  updateVehiclePosition: (pos: VehiclePosition) => void;
  pushActivity: (event: Omit<ActivityEvent, 'id'>) => void;
  pushBoardingEvent: (event: BoardingEvent) => void;
};

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  revision: 0,
  vehiclePositions: [],
  activityFeed: [],
  boardingEvents: [],

  setConnected: (connected) => set({ connected }),
  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),

  updateVehiclePosition: (pos) =>
    set((state) => {
      const lat = Number(pos.lat);
      const lng = Number(pos.lng);
      const vehicleId = pos.vehicleId;
      if (!vehicleId || Number.isNaN(lat) || Number.isNaN(lng)) {
        console.debug('[MAP] ignore invalid GPS payload', pos);
        return state;
      }

      const normalized: VehiclePosition = {
        ...pos,
        vehicleId,
        lat,
        lng,
        speed: pos.speed == null ? undefined : Number(pos.speed),
        heading: pos.heading == null ? undefined : Number(pos.heading),
        accuracy: pos.accuracy == null ? undefined : Number(pos.accuracy),
        online: pos.online ?? true,
      };
      console.debug('[MAP] marker update', {
        vehicleId: normalized.vehicleId,
        driverId: normalized.driverId,
        routeId: normalized.routeId,
        lat: normalized.lat,
        lng: normalized.lng,
        speed: normalized.speed,
      });

      const others = state.vehiclePositions.filter((v) => v.vehicleId !== normalized.vehicleId);
      return { vehiclePositions: [...others, normalized] };
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
