export type TrackingPolicy = {
  persistDistanceMeters: number;
  persistMaxIntervalSeconds: number;
  persistHeadingDeltaDegrees: number;
  floodMinIntervalMs: number;
  retentionHours: number;
  staleRetentionHours: number;
  snapshotRetentionHours: number;
  archiveEnabled: boolean;
  geofenceArrivalRadiusMeters: number;
  geofenceDepartureRadiusMeters: number;
  geofenceLongStopSeconds: number;
  geofenceDeviationMeters: number;
  geofenceMinEvaluationMs: number;
  geofenceAlertCooldownSeconds: number;
  geofenceAutoArrived: boolean;
  geofenceAutoProgression: boolean;
  geofenceAlertsEnabled: boolean;
};

export type GpsPointLike = {
  lat: number;
  lng: number;
  heading?: number | null;
  timestamp: Date;
};

export type PersistDecision = {
  persist: boolean;
  reason: 'first_point' | 'distance' | 'time' | 'heading' | 'skip';
  distanceMeters: number;
  elapsedSeconds: number;
  headingDelta: number;
};

function getEnvNumber(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function getEnvBoolean(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

export function loadTrackingPolicy(): TrackingPolicy {
  return {
    persistDistanceMeters: getEnvNumber('TRACKING_PERSIST_DISTANCE_METERS', 30, 3, 2000),
    persistMaxIntervalSeconds: getEnvNumber('TRACKING_PERSIST_MAX_INTERVAL_SECONDS', 25, 3, 3600),
    persistHeadingDeltaDegrees: getEnvNumber('TRACKING_PERSIST_HEADING_DELTA_DEGREES', 20, 3, 180),
    floodMinIntervalMs: getEnvNumber('TRACKING_FLOOD_MIN_INTERVAL_MS', 800, 0, 30_000),
    retentionHours: getEnvNumber('TRACKING_RETENTION_HOURS', 72, 1, 24 * 365),
    staleRetentionHours: getEnvNumber('TRACKING_STALE_RETENTION_HOURS', 24, 1, 24 * 365),
    snapshotRetentionHours: getEnvNumber('TRACKING_SNAPSHOT_RETENTION_HOURS', 24, 1, 24 * 365),
    archiveEnabled: getEnvBoolean('TRACKING_ARCHIVE_ENABLED', true),
    geofenceArrivalRadiusMeters: getEnvNumber('OPS_GEOFENCE_ARRIVAL_RADIUS_METERS', 180, 20, 2000),
    geofenceDepartureRadiusMeters: getEnvNumber('OPS_GEOFENCE_DEPARTURE_RADIUS_METERS', 320, 30, 4000),
    geofenceLongStopSeconds: getEnvNumber('OPS_GEOFENCE_LONG_STOP_SECONDS', 240, 30, 60 * 60),
    geofenceDeviationMeters: getEnvNumber('OPS_GEOFENCE_DEVIATION_METERS', 3000, 200, 50_000),
    geofenceMinEvaluationMs: getEnvNumber('OPS_GEOFENCE_MIN_EVALUATION_MS', 5000, 500, 120_000),
    geofenceAlertCooldownSeconds: getEnvNumber('OPS_GEOFENCE_ALERT_COOLDOWN_SECONDS', 180, 10, 3600),
    geofenceAutoArrived: getEnvBoolean('OPS_GEOFENCE_AUTO_ARRIVED', false),
    geofenceAutoProgression: getEnvBoolean('OPS_GEOFENCE_AUTO_ROUTE_PROGRESSION', false),
    geofenceAlertsEnabled: getEnvBoolean('OPS_GEOFENCE_ALERTS_ENABLED', true),
  };
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function headingDeltaDegrees(a?: number | null, b?: number | null) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs((((b - a + 540) % 360) - 180));
}

export function shouldPersistTrackingPoint(
  last: GpsPointLike | null,
  incoming: GpsPointLike,
  policy: TrackingPolicy,
): PersistDecision {
  if (!last) {
    return {
      persist: true,
      reason: 'first_point',
      distanceMeters: 0,
      elapsedSeconds: 0,
      headingDelta: 0,
    };
  }
  const distance = distanceMeters(last.lat, last.lng, incoming.lat, incoming.lng);
  const elapsed = Math.max(0, (+incoming.timestamp - +last.timestamp) / 1000);
  const headingDelta = headingDeltaDegrees(last.heading ?? null, incoming.heading ?? null);
  if (distance >= policy.persistDistanceMeters) {
    return { persist: true, reason: 'distance', distanceMeters: distance, elapsedSeconds: elapsed, headingDelta };
  }
  if (elapsed >= policy.persistMaxIntervalSeconds) {
    return { persist: true, reason: 'time', distanceMeters: distance, elapsedSeconds: elapsed, headingDelta };
  }
  if (headingDelta >= policy.persistHeadingDeltaDegrees) {
    return { persist: true, reason: 'heading', distanceMeters: distance, elapsedSeconds: elapsed, headingDelta };
  }
  return { persist: false, reason: 'skip', distanceMeters: distance, elapsedSeconds: elapsed, headingDelta };
}

export function shouldThrottleGps(lastAcceptedMs: number | undefined, nowMs: number, minIntervalMs: number) {
  if (!lastAcceptedMs || minIntervalMs <= 0) return false;
  return nowMs - lastAcceptedMs < minIntervalMs;
}
