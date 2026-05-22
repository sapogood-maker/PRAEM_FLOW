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
      const fallbackId = pos.driverId ? `driver:${pos.driverId}` : undefined;
      const markerId = pos.vehicleId ?? fallbackId;
      if (!markerId || Number.isNaN(lat) || Number.isNaN(lng)) {
        console.debug('[MAP] filtered payload', {
          reason: !markerId ? 'missing vehicleId/driverId' : 'invalid coordinates',
          payload: pos,
        });
        return state;
      }

      const existed = state.vehiclePositions.find((v) => v.vehicleId === markerId);
      const normalized: VehiclePosition = {
        ...pos,
        vehicleId: markerId,
        lat,
        lng,
        speed: pos.speed == null ? undefined : Number(pos.speed),
        heading: pos.heading == null ? undefined : Number(pos.heading),
        accuracy: pos.accuracy == null ? undefined : Number(pos.accuracy),
        online: pos.online ?? true,
      };
      console.debug(existed ? '[MAP] marker updated' : '[MAP] marker created', {
        vehicleId: normalized.vehicleId,
        driverId: normalized.driverId,
        routeId: normalized.routeId,
        lat: normalized.lat,
        lng: normalized.lng,
        speed: normalized.speed,
      });

      const others = state.vehiclePositions.filter((v) => v.vehicleId !== markerId);
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
