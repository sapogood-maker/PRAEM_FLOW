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
      const raw = pos as VehiclePosition & {
        latitude?: unknown;
        longitude?: unknown;
        lat?: unknown;
        lng?: unknown;
        vehicleId?: string;
        driverId?: string | null;
        routeId?: string | null;
      };
      const rawLat = raw.lat ?? raw.latitude;
      const rawLng = raw.lng ?? raw.longitude;
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      const markerId = raw.vehicleId ?? raw.driverId ?? undefined;

      console.debug('[GPS] raw websocket payload', raw);
      console.debug('[GPS] coordinate aliases', {
        latValue: raw.lat,
        lngValue: raw.lng,
        latitudeValue: raw.latitude,
        longitudeValue: raw.longitude,
        latType: typeof rawLat,
        lngType: typeof rawLng,
        vehicleId: raw.vehicleId,
        driverId: raw.driverId,
        routeId: raw.routeId,
      });

      if (!markerId) {
        console.debug('[MAP] payload rejected', {
          reason: 'missing markerId (vehicleId ?? driverId)',
          payload: raw,
        });
        return state;
      }
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        console.debug('[MAP] payload rejected', {
          reason: 'invalid coordinates',
          markerId,
          rawLat,
          rawLng,
          payload: raw,
        });
        return state;
      }

      const existed = state.vehiclePositions.find((v) => v.vehicleId === markerId);
      const normalized: VehiclePosition = {
        ...raw,
        vehicleId: markerId,
        lat,
        lng,
        speed: raw.speed == null ? undefined : Number(raw.speed),
        heading: raw.heading == null ? undefined : Number(raw.heading),
        accuracy: raw.accuracy == null ? undefined : Number(raw.accuracy),
        online: raw.online ?? true,
      };
      console.debug('[MAP] payload accepted', {
        markerId,
        lat: normalized.lat,
        lng: normalized.lng,
        driverId: normalized.driverId,
        routeId: normalized.routeId,
      });
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
