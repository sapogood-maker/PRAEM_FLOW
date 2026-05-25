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
  vehicleTrails: Record<string, Array<{ lat: number; lng: number; timestamp: string; speed?: number; status?: string }>>;
  routeOperationalStates: Record<string, { operationalState: string; updatedAt: string; tripId?: string | null }>;
  activityFeed: ActivityEvent[];
  boardingEvents: BoardingEvent[];
  setConnected: (connected: boolean) => void;
  bumpRevision: () => void;
  updateVehiclePosition: (pos: VehiclePosition) => void;
  setRouteOperationalState: (routeId: string, payload: { operationalState: string; updatedAt: string; tripId?: string | null }) => void;
  pushActivity: (event: Omit<ActivityEvent, 'id'>) => void;
  pushBoardingEvent: (event: BoardingEvent) => void;
};

const MAX_TRAIL_POINTS = 280;
const MIN_POINT_DISTANCE_METERS = 5;

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return 6371000 * c;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  revision: 0,
  vehiclePositions: [],
  vehicleTrails: {},
  routeOperationalStates: {},
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
      const speed = raw.speed == null ? undefined : Number(raw.speed);
      const speedSafe = speed == null || Number.isNaN(speed) ? undefined : speed;
      const isStopped = speedSafe != null && speedSafe < 3;
      const statusRaw = String(raw.operationalStatus ?? '');
      const normalizedStatus =
        raw.online === false
          ? 'OFFLINE'
          : statusRaw.toUpperCase() === 'COMPLETED'
              ? 'COMPLETED'
              : isStopped
                  ? 'STOPPED'
                  : (statusRaw || 'MOVING').toUpperCase();
      const normalized: VehiclePosition = {
        ...raw,
        vehicleId: markerId,
        lat,
        lng,
        speed: speedSafe,
        heading: raw.heading == null ? undefined : Number(raw.heading),
        accuracy: raw.accuracy == null ? undefined : Number(raw.accuracy),
        online: raw.online ?? true,
        operationalStatus: normalizedStatus,
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
      const currentTrail = state.vehicleTrails[markerId] ?? [];
      const lastPoint = currentTrail[currentTrail.length - 1];
      const shouldAppend =
        !lastPoint ||
        haversineMeters(lastPoint.lat, lastPoint.lng, normalized.lat, normalized.lng) >= MIN_POINT_DISTANCE_METERS;
      const nextTrail = shouldAppend
        ? [
            ...currentTrail,
            {
              lat: normalized.lat,
              lng: normalized.lng,
              timestamp: normalized.timestamp ?? normalized.updatedAt ?? new Date().toISOString(),
              speed: normalized.speed,
              status: normalized.operationalStatus,
            },
          ].slice(-MAX_TRAIL_POINTS)
        : currentTrail;

      if (shouldAppend) {
        console.debug('[MAP] trail point appended', {
          markerId,
          points: nextTrail.length,
          lat: normalized.lat,
          lng: normalized.lng,
          status: normalized.operationalStatus,
        });
      }

      return {
        vehiclePositions: [...others, normalized],
        vehicleTrails: {
          ...state.vehicleTrails,
          [markerId]: nextTrail,
        },
      };
    }),

  setRouteOperationalState: (routeId, payload) =>
    set((state) => ({
      routeOperationalStates: {
        ...state.routeOperationalStates,
        [routeId]: payload,
      },
    })),

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
