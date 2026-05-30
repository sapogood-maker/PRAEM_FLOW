'use client';

import 'leaflet/dist/leaflet.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { cn } from '@/lib/utils';
import { useRealtimeStore } from '@/store/realtime.store';
import { useOperationalControlStore, type OperationalFocus } from '@/store/operationalControl.store';
import { UI_TEXT } from '@/lib/ui-text';
import { VehicleMarker } from './VehicleMarker';

type PickupPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  appointmentDate?: string | null;
  destination?: string | null;
  patientName?: string | null;
  status?: string | null;
  priority?: string | null;
};

type OperationalMapProps = {
  pickupPoints?: PickupPoint[];
  queueItems?: Array<{ id: string; patientId?: string | null }>;
  routes?: Array<{
    id: string;
    operationId?: string | null;
    status?: string | null;
    origin?: string | null;
    destination?: string | null;
    scheduledAt?: string | null;
    vehicle?: { id: string; plate?: string | null; model?: string | null; capacity?: number | null } | null;
    driver?: { id: string; user?: { name?: string | null } | null } | null;
    trips?: Array<{
      id: string;
      status?: string | null;
      patient?: { id: string; name?: string | null } | null;
    }>;
  }>;
  showFleetList?: boolean;
  className?: string;
};

const DEFAULT_CITY_CENTER: [number, number] = [-25.5163, -54.5854];
const DEFAULT_CITY_ZOOM = 13;

function formatTime(iso?: string | null) {
  if (!iso) return '--:--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatEta(iso?: string | null) {
  if (!iso) return UI_TEXT.operationalMap.etaLive;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return UI_TEXT.operationalMap.etaLive;
  const delta = Math.round((target - Date.now()) / 60000);
  if (delta <= 0) return UI_TEXT.operationalMap.etaNow;
  return `ETA ${delta}m`;
}

function statusTone(status?: string, online?: boolean) {
  if (online === false) return 'bg-slate-800/80 text-slate-400 ring-slate-700/60';
  switch ((status ?? '').toUpperCase()) {
    case 'BOARDING':
      return 'bg-amber-500/15 text-amber-300 ring-amber-500/20';
    case 'WAITING':
    case 'STOPPED':
      return 'bg-yellow-500/15 text-yellow-300 ring-yellow-500/20';
    case 'CRITICAL':
    case 'GPS_LOST':
      return 'bg-red-500/15 text-red-300 ring-red-500/20';
    case 'COMPLETED':
      return 'bg-slate-700/80 text-slate-300 ring-white/10';
    default:
      return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/20';
  }
}

function trailStyle(status?: string) {
  switch ((status ?? '').toUpperCase()) {
    case 'BOARDING':
      return { color: '#f59e0b', opacity: 0.95 };
    case 'STOPPED':
      return { color: '#eab308', opacity: 0.9 };
    case 'OFFLINE':
      return { color: '#94a3b8', opacity: 0.65 };
    case 'COMPLETED':
      return { color: '#64748b', opacity: 0.75 };
    default:
      return { color: '#38bdf8', opacity: 0.9 };
  }
}

function getFocusLabel(focus?: { label?: string; scope?: string; routeId?: string | null; vehicleId?: string | null; operationId?: string | null } | null) {
  if (!focus) return UI_TEXT.operationalMap.panelTitle;
  if (focus.label) return focus.label;
  if (focus.operationId) return `Operação ${focus.operationId.slice(0, 8)}`;
  if (focus.routeId) return `Rota ${focus.routeId.slice(0, 8)}`;
  if (focus.vehicleId) return `Veículo ${focus.vehicleId.slice(0, 8)}`;
  return UI_TEXT.operationalMap.panelTitle;
}

function calcTrailDistanceKm(points: Array<{ lat: number; lng: number }>) {
  if (points.length < 2) return 0;
  const toRad = (n: number) => (n * Math.PI) / 180;
  let meters = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const aa =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    meters += 6371000 * (2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa)));
  }
  return meters / 1000;
}

function MapAutoFocus({
  followVehicles,
  vehicles,
  pickupPoints,
  routes,
  focus,
}: {
  followVehicles: boolean;
  vehicles: Array<{ id: string; lat: number; lng: number }>;
  pickupPoints: Array<{ id: string; lat: number; lng: number }>;
  routes: OperationalMapProps['routes'];
  focus: OperationalFocus | null;
}) {
  const map = useMap();
  const initialized = useRef(false);

  useEffect(() => {
    const selectedRoute = focus?.routeId
      ? routes?.find((route) => route.id === focus.routeId || route.operationId === focus.routeId || route.operationId === focus.operationId)
      : focus?.operationId
        ? routes?.find((route) => route.operationId === focus.operationId)
        : null;

    const selectedVehicleId = focus?.vehicleId ?? selectedRoute?.vehicle?.id ?? null;
    const vehicle = selectedVehicleId ? vehicles.find((item) => item.id === selectedVehicleId) : null;
    const pickupPoint = focus?.queueIds?.length
      ? pickupPoints.find((point) => focus.queueIds.includes(point.id))
      : null;
    const fallbackPoints = [...vehicles, ...pickupPoints];

    const points = [
      ...(focus?.center ? [{ id: 'focus-center', lat: focus.center.lat, lng: focus.center.lng }] : []),
      ...(vehicle ? [vehicle] : []),
      ...(pickupPoint ? [pickupPoint] : []),
      ...(selectedRoute?.vehicle && !vehicle ? vehicles.filter((item) => item.id === selectedRoute.vehicle?.id) : []),
      ...(selectedRoute && !vehicle && !pickupPoint ? fallbackPoints : []),
    ];

    if (points.length === 0) {
      if (!initialized.current) map.setView(DEFAULT_CITY_CENTER, DEFAULT_CITY_ZOOM);
      initialized.current = false;
      return;
    }

    initialized.current = true;
    if (!followVehicles && !focus) return;

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], focus?.zoom ?? 16);
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: focus?.zoom ?? 16 });
  }, [focus, followVehicles, map, pickupPoints, routes, vehicles]);

  return null;
}

function PickupMarker({
  point,
  focused,
  onSelect,
}: {
  point: PickupPoint;
  focused?: boolean;
  onSelect?: () => void;
}) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'pickup-marker',
        iconSize: [focused ? 86 : 78, focused ? 60 : 54],
        iconAnchor: [focused ? 43 : 39, focused ? 48 : 44],
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
            <div style="padding:3px 8px;border-radius:9999px;background:rgba(15,23,42,.92);border:1px solid ${focused ? 'rgba(34,211,238,.28)' : 'rgba(255,255,255,.08)'};color:${focused ? '#67e8f9' : '#cbd5e1'};font-size:10px;letter-spacing:.18em;text-transform:uppercase;box-shadow:${focused ? '0 0 0 6px rgba(34,211,238,.08)' : 'none'};">
              ${formatEta(point.appointmentDate)}
            </div>
            <div style="position:relative;width:18px;height:18px;">
              <span style="position:absolute;inset:-6px;border-radius:9999px;background:rgba(56,189,248,.16);animation:mapPulse 1.8s infinite;"></span>
              <span style="position:absolute;inset:0;border-radius:9999px;background:#cbd5e1;border:2px solid #0f172a;"></span>
            </div>
          </div>
          <style>
            @keyframes mapPulse {
              0% { transform: scale(.9); opacity: .6; }
              70% { transform: scale(1.25); opacity: 0; }
              100% { transform: scale(1.25); opacity: 0; }
            }
          </style>
        `,
      }),
    [point.appointmentDate],
  );

  return (
    <Marker position={[point.lat, point.lng]} icon={icon} eventHandlers={onSelect ? { click: onSelect } : undefined}>
      <Popup>
        <div className='min-w-[220px] text-xs text-slate-200'>
          <p className='text-sm font-semibold text-slate-100'>{point.label}</p>
          <p className='mt-1 text-slate-300'>{point.destination ?? UI_TEXT.operationalMap.destination}</p>
          <p className='text-slate-400'>
            {point.patientName ? `${UI_TEXT.operationalMap.patientPrefix}: ${point.patientName}` : UI_TEXT.operationalMap.pickupWindow} · {formatTime(point.appointmentDate)}
          </p>
          <p className='mt-2 text-slate-300'>{formatEta(point.appointmentDate)}</p>
          {focused && <p className='mt-2 text-cyan-300'>Fila em foco</p>}
        </div>
      </Popup>
    </Marker>
  );
}

export default function OperationalMap({ pickupPoints = [], queueItems = [], routes = [], showFleetList = true, className }: OperationalMapProps) {
  const vehicles = useRealtimeStore((s) => s.vehiclePositions);
  const trails = useRealtimeStore((s) => s.vehicleTrails);
  const connected = useRealtimeStore((s) => s.connected);
  const focus = useOperationalControlStore((s) => s.focus);
  const setFocus = useOperationalControlStore((s) => s.setFocus);
  const validVehicles = useMemo(
    () => vehicles.filter((vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lng)),
    [vehicles],
  );
  const validPickups = useMemo(
    () => pickupPoints.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)),
    [pickupPoints],
  );
  const [followVehicles, setFollowVehicles] = useState(true);
  const liveVehicles = useMemo(() => validVehicles.filter((v) => v.online !== false).length, [validVehicles]);
  const selectedRoute = useMemo(
    () =>
      focus?.routeId
        ? routes.find((route) => route.id === focus.routeId || route.operationId === focus.routeId || route.operationId === focus.operationId)
        : focus?.operationId
          ? routes.find((route) => route.operationId === focus.operationId)
          : null,
    [focus?.operationId, focus?.routeId, routes],
  );
  const selectedVehicleId = focus?.vehicleId ?? selectedRoute?.vehicle?.id ?? null;
  const focusedPickupIds = useMemo(() => new Set(focus?.queueIds ?? []), [focus?.queueIds]);
  const focusedTitle = getFocusLabel(focus);
  const queueItemLookup = useMemo(
    () => {
      const lookup = new Map<string, string>();
      for (const item of queueItems) {
        lookup.set(item.id, item.id);
        if (item.patientId) lookup.set(item.patientId, item.id);
      }
      return lookup;
    },
    [queueItems],
  );

  useEffect(() => {
    const invalidVehicles = vehicles.filter((vehicle) => !Number.isFinite(vehicle.lat) || !Number.isFinite(vehicle.lng));
    if (invalidVehicles.length > 0) {
      console.debug('[MAP] invalid vehicle coordinates filtered', invalidVehicles.length);
    }
  }, [vehicles]);

  return (
    <section className={cn('rounded-[28px] border border-white/5 bg-slate-950/80 p-4 shadow-2xl backdrop-blur-xl', className)}>
      <div className='flex flex-wrap items-center justify-between gap-3 pb-4'>
        <div>
          <p className='text-[11px] uppercase tracking-[0.32em] text-slate-500'>{UI_TEXT.operationalMap.panelOverline}</p>
          <h3 className='mt-1 text-lg font-semibold text-slate-100'>{UI_TEXT.operationalMap.panelTitle}</h3>
          <p className='mt-1 text-xs text-slate-500'>{focusedTitle}</p>
        </div>
        <div className='flex items-center gap-2'>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${connected ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
            {connected ? UI_TEXT.operationalMap.realtimeConnected : UI_TEXT.operationalMap.realtimeOffline}
          </span>
          <button
            type='button'
            onClick={() => setFollowVehicles((value) => !value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${followVehicles ? 'bg-cyan-500/15 text-cyan-300' : 'bg-white/5 text-slate-400'}`}
          >
            {followVehicles ? UI_TEXT.operationalMap.followOn : UI_TEXT.operationalMap.followOff}
          </button>
        </div>
      </div>

      <div className={cn('grid gap-4', showFleetList ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1')}>
        <div className='relative overflow-hidden rounded-[24px] border border-white/5 bg-slate-900/60'>
          <div className='pointer-events-none absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-full border border-white/5 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-300 shadow-2xl backdrop-blur-xl'>
            <span className='h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_6px_rgba(74,222,128,0.08)]' />
            {liveVehicles}/{validVehicles.length} {UI_TEXT.operationalMap.vehiclesLive} · {validPickups.length} {UI_TEXT.operationalMap.pickupWindows}
          </div>
          {focus && (
            <div className='pointer-events-none absolute right-4 top-4 z-[500] max-w-[360px] rounded-[20px] border border-white/5 bg-slate-950/85 px-4 py-3 text-xs text-slate-300 shadow-2xl backdrop-blur-xl'>
              <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Foco operacional</p>
              <p className='mt-1 font-semibold text-slate-100'>{focus.label ?? focusedTitle}</p>
              <p className='mt-1 text-slate-400'>
                {focus.scope.toUpperCase()} · {focus.status ?? 'ATIVO'}
              </p>
            </div>
          )}
          <MapContainer
            center={DEFAULT_CITY_CENTER}
            zoom={DEFAULT_CITY_ZOOM}
            className='h-[680px] w-full'
            zoomControl={false}
          >
            <TileLayer
              url='https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
              attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            />
            <MapAutoFocus
              followVehicles={followVehicles}
              vehicles={validVehicles.map((vehicle) => ({ id: vehicle.vehicleId, lat: vehicle.lat, lng: vehicle.lng }))}
              pickupPoints={validPickups}
              routes={routes}
              focus={focus}
            />
            {validVehicles.map((vehicle) => {
              const points = trails[vehicle.vehicleId] ?? [];
              const oldTrail = points.slice(0, Math.max(0, points.length - 20));
              const recentTrail = points.slice(Math.max(0, points.length - 20));
              const style = trailStyle(vehicle.operationalStatus);
              const isFocusedVehicle = selectedVehicleId === vehicle.vehicleId;
              const isRouteVehicle = Boolean(selectedRoute?.vehicle?.id && selectedRoute.vehicle.id === vehicle.vehicleId);
              const opacity = isFocusedVehicle || isRouteVehicle ? 1 : 0.55;
              return (
                <Fragment key={`trail-${vehicle.vehicleId}`}>
                  {oldTrail.length > 1 && (
                    <Polyline positions={oldTrail.map((point) => [point.lat, point.lng] as [number, number])} pathOptions={{ color: style.color, weight: isFocusedVehicle ? 5 : 4, opacity: opacity * 0.2 }} />
                  )}
                  {recentTrail.length > 1 && (
                    <Polyline positions={recentTrail.map((point) => [point.lat, point.lng] as [number, number])} pathOptions={{ color: isFocusedVehicle ? '#67e8f9' : style.color, weight: isFocusedVehicle ? 7 : 5, opacity: isFocusedVehicle ? 1 : style.opacity * opacity }} />
                  )}
                </Fragment>
              );
            })}
            {validPickups.map((point) => (
              <PickupMarker
                key={point.id}
                point={point}
                focused={focusedPickupIds.has(point.id)}
                onSelect={() =>
                  setFocus({
                    scope: 'queue',
                    queueIds: [point.id],
                    routeId: null,
                    vehicleId: null,
                    operationId: null,
                    center: { lat: point.lat, lng: point.lng },
                    zoom: 16,
                    label: point.label,
                    status: point.status ?? undefined,
                  })
                }
              />
            ))}
            {validVehicles.map((vehicle) => (
              <VehicleMarker
                key={vehicle.vehicleId}
                position={[vehicle.lat, vehicle.lng]}
                vehicleId={vehicle.vehicleId}
                driverId={vehicle.driverId}
                plate={vehicle.plate}
                vehicleModel={vehicle.vehicleModel}
                speed={vehicle.speed}
                heading={vehicle.heading}
                operationalStatus={vehicle.operationalStatus}
                online={vehicle.online}
                updatedAt={vehicle.timestamp ?? vehicle.updatedAt}
                focused={selectedVehicleId === vehicle.vehicleId}
                onSelect={() => {
                  const route = routes.find((item) => item.vehicle?.id === vehicle.vehicleId || item.id === vehicle.routeId || item.operationId === vehicle.routeId);
                  const queueIds =
                    route?.trips?.flatMap((trip) => {
                      const queueId = trip.patient?.id ? queueItemLookup.get(trip.patient.id) : null;
                      return queueId ? [queueId] : [];
                    }) ?? [];
                  setFocus({
                    scope: route ? 'route' : 'vehicle',
                    queueIds,
                    routeId: route?.id ?? vehicle.routeId ?? null,
                    vehicleId: vehicle.vehicleId,
                    operationId: route?.operationId ?? vehicle.routeId ?? null,
                    center: { lat: vehicle.lat, lng: vehicle.lng },
                    zoom: 15,
                    label: route ? `${route.origin ?? 'Rota'} → ${route.destination ?? 'destino'}` : vehicle.plate ?? vehicle.vehicleId,
                    status: vehicle.operationalStatus,
                  });
                }}
              />
            ))}
          </MapContainer>
        </div>

        {showFleetList && (
          <aside className='space-y-3 rounded-[24px] border border-white/5 bg-slate-950/80 p-4 shadow-2xl backdrop-blur-xl'>
            <div className='flex items-center justify-between gap-2'>
              <h4 className='text-sm font-semibold uppercase tracking-[0.28em] text-slate-400'>{UI_TEXT.operationalMap.fleetSnapshot}</h4>
              <span className='rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-400'>{liveVehicles}/{validVehicles.length}</span>
            </div>
            <div className='space-y-2 max-h-[620px] overflow-y-auto pr-1'>
              {validVehicles.length === 0 ? (
                <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-sm text-slate-500'>
                  {UI_TEXT.operationalMap.waitingGps}
                </div>
              ) : (
                validVehicles.map((vehicle) => {
                  const online = vehicle.online !== false;
                  const status = online ? (vehicle.operationalStatus ?? 'MOVING') : 'OFFLINE';
                  const points = trails[vehicle.vehicleId] ?? [];
                  const distance = calcTrailDistanceKm(points).toFixed(2);
                  return (
                    <div key={vehicle.vehicleId} className={`rounded-2xl border px-3 py-3 transition-colors ${selectedVehicleId === vehicle.vehicleId ? 'border-cyan-500/30 bg-cyan-500/10' : 'border-white/5 bg-white/5'}`}>
                      <div className='flex items-center justify-between gap-3'>
                        <div className='min-w-0'>
                          <p className='truncate text-sm font-medium text-slate-100'>{vehicle.plate ?? vehicle.vehicleId}</p>
                          <p className='mt-1 text-xs text-slate-500'>
                            {vehicle.driverName ?? vehicle.driverId ?? UI_TEXT.operationalMap.driverPending} · {distance} km
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusTone(status, online)}`}>
                          {status}
                        </span>
                      </div>
                      <p className='mt-2 text-xs text-slate-500'>
                        {UI_TEXT.operationalMap.speed} {vehicle.speed != null ? `${Math.max(0, vehicle.speed).toFixed(0)} km/h` : '—'} · {UI_TEXT.operationalMap.updated}{' '}
                        {vehicle.timestamp ?? vehicle.updatedAt
                          ? new Date(vehicle.timestamp ?? vehicle.updatedAt ?? '').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                          : '--:--'}
                      </p>
                      <button
                        type='button'
                        onClick={() => {
                          const route = routes.find((item) => item.vehicle?.id === vehicle.vehicleId || item.id === vehicle.routeId || item.operationId === vehicle.routeId);
                          const queueIds =
                            route?.trips?.flatMap((trip) => {
                              const queueId = trip.patient?.id ? queueItemLookup.get(trip.patient.id) : null;
                              return queueId ? [queueId] : [];
                            }) ?? [];
                          setFocus({
                            scope: route ? 'route' : 'vehicle',
                            queueIds,
                            routeId: route?.id ?? vehicle.routeId ?? null,
                            vehicleId: vehicle.vehicleId,
                            operationId: route?.operationId ?? vehicle.routeId ?? null,
                            center: { lat: vehicle.lat, lng: vehicle.lng },
                            zoom: 15,
                            label: route ? `${route.origin ?? 'Rota'} → ${route.destination ?? 'destino'}` : vehicle.plate ?? vehicle.vehicleId,
                            status: vehicle.operationalStatus,
                          });
                        }}
                        className='mt-3 rounded-full border border-white/5 bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-slate-300 hover:border-cyan-500/30 hover:text-cyan-200'
                      >
                        Focar veículo
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
