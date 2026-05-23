'use client';

import 'leaflet/dist/leaflet.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { VehicleMarker } from './VehicleMarker';
import { useRealtimeStore } from '@/store/realtime.store';

function statusView(status?: string, online?: boolean) {
  const current = online === false ? 'OFFLINE' : (status ?? 'ONLINE').toUpperCase();
  switch (current) {
    case 'WAITING':
    case 'WAITING_PATIENT':
      return { label: 'Aguardando', className: 'bg-amber-900 text-amber-300' };
    case 'BOARDING':
      return { label: 'Embarque', className: 'bg-blue-900 text-blue-300' };
    case 'BOARDED':
      return { label: 'EMBARCADO', className: 'bg-blue-900 text-blue-300' };
    case 'PASSENGERS_ONBOARD':
      return { label: 'PASSAGEIROS EMBARCADOS', className: 'bg-cyan-900 text-cyan-300' };
    case 'STOPPED':
      return { label: 'Parado', className: 'bg-amber-900 text-amber-300' };
    case 'IN_TRANSIT':
    case 'MOVING':
    case 'ONLINE':
      return { label: 'Em deslocamento', className: 'bg-emerald-900 text-emerald-300' };
    case 'COMPLETED':
      return { label: 'Concluído', className: 'bg-slate-700 text-slate-300' };
    case 'CRITICAL':
    case 'GPS_LOST':
      return { label: 'Crítico', className: 'bg-red-900 text-red-300' };
    case 'OFFLINE':
    default:
      return { label: 'Offline', className: 'bg-slate-800 text-slate-300' };
  }
}

function trailStyle(status?: string) {
  switch ((status ?? '').toUpperCase()) {
    case 'STOPPED':
      return { color: '#d29922', opacity: 0.95 };
    case 'OFFLINE':
      return { color: '#da3633', opacity: 0.95 };
    case 'COMPLETED':
      return { color: '#8b949e', opacity: 0.95 };
    case 'MOVING':
    case 'IN_TRANSIT':
    case 'BOARDED':
    case 'PASSENGERS_ONBOARD':
    case 'ONLINE':
    default:
      return { color: '#2da44e', opacity: 0.95 };
  }
}

function fmtLastUpdate(ts?: string) {
  if (!ts) return 'agora';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'agora';
  return d.toLocaleTimeString('pt-BR');
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

const DEFAULT_CITY_CENTER: [number, number] = [-25.5163, -54.5854];
const DEFAULT_CITY_ZOOM = 13;
const SINGLE_VEHICLE_FOCUS_ZOOM = 17;

function MapAutoFocus({
  followVehicle,
  vehicles,
}: {
  followVehicle: boolean;
  vehicles: Array<{ vehicleId: string; lat: number; lng: number }>;
}) {
  const map = useMap();
  const hadVehiclesRef = useRef(false);

  useEffect(() => {
    if (vehicles.length === 0) {
      if (!hadVehiclesRef.current) {
        map.setView(DEFAULT_CITY_CENTER, DEFAULT_CITY_ZOOM);
      }
      hadVehiclesRef.current = false;
      console.debug('[MAP] autofocus fallback city', {
        center: DEFAULT_CITY_CENTER,
        zoom: DEFAULT_CITY_ZOOM,
      });
      return;
    }

    const firstVehicleAppeared = !hadVehiclesRef.current;
    hadVehiclesRef.current = true;
    if (!followVehicle && !firstVehicleAppeared) return;

    if (vehicles.length === 1) {
      const single = vehicles[0];
      const targetZoom = Math.max(16, Math.min(18, map.getZoom() || SINGLE_VEHICLE_FOCUS_ZOOM));
      map.setView([single.lat, single.lng], targetZoom);
      console.debug('[MAP] autofocus single vehicle', {
        vehicleId: single.vehicleId,
        lat: single.lat,
        lng: single.lng,
        zoom: targetZoom,
        followVehicle,
        firstVehicleAppeared,
      });
      return;
    }

    const bounds = L.latLngBounds(vehicles.map((v) => [v.lat, v.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    console.debug('[MAP] autofocus multiple vehicles', {
      vehicles: vehicles.length,
      followVehicle,
      firstVehicleAppeared,
    });
  }, [vehicles, followVehicle, map]);

  return null;
}

export default function OperationalMap() {
  const vehicles = useRealtimeStore((s) => s.vehiclePositions);
  const trails = useRealtimeStore((s) => s.vehicleTrails);
  const [followActive, setFollowActive] = useState(true);
  const validVehicles = useMemo(
    () => vehicles.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)),
    [vehicles],
  );
  const focusVehicles = useMemo(
    () => validVehicles.map((v) => ({ vehicleId: v.vehicleId, lat: v.lat, lng: v.lng })),
    [validVehicles],
  );
  const onlineCount = useMemo(() => validVehicles.filter((v) => v.online !== false).length, [validVehicles]);

  useEffect(() => {
    const filteredOut = vehicles.filter((v) => !Number.isFinite(v.lat) || !Number.isFinite(v.lng));
    if (filteredOut.length > 0) {
      console.debug('[MAP] filtered drivers', filteredOut.map((v) => ({
        vehicleId: v.vehicleId,
        driverId: v.driverId,
        reason: 'invalid coordinates',
      })));
    }
    console.debug('[MAP] filter policy', {
      routeFiltering: 'disabled',
      vehicleFiltering: 'disabled',
      statusFiltering: 'disabled (online derived from payload)',
      namespace: '/operations',
    });
    console.debug('[MAP] render snapshot', {
      total: vehicles.length,
      valid: validVehicles.length,
      online: onlineCount,
    });
  }, [vehicles, validVehicles, onlineCount]);

  return (
    <div className='grid gap-4 lg:grid-cols-[1fr_300px]'>
      <MapContainer
        center={DEFAULT_CITY_CENTER}
        zoom={DEFAULT_CITY_ZOOM}
        className='h-[520px] rounded-xl border border-border'
      >
        <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' attribution='&copy; OpenStreetMap contributors' />
        <MapAutoFocus followVehicle={followActive} vehicles={focusVehicles} />
        {validVehicles.map((v) => {
          const points = trails[v.vehicleId] ?? [];
          const oldTrail = points.slice(0, Math.max(0, points.length - 24));
          const recentTrail = points.slice(Math.max(0, points.length - 24));
          const style = trailStyle(v.operationalStatus);
          return (
            <Fragment key={`trail-${v.vehicleId}`}>
              {oldTrail.length > 1 && (
                <Polyline
                  positions={oldTrail.map((p) => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: style.color, weight: 4, opacity: 0.22 }}
                />
              )}
              {recentTrail.length > 1 && (
                <Polyline
                  positions={recentTrail.map((p) => [p.lat, p.lng] as [number, number])}
                  pathOptions={{ color: style.color, weight: 5, opacity: style.opacity }}
                />
              )}
            </Fragment>
          );
        })}
        {validVehicles.map((v) => (
          <VehicleMarker
            key={v.vehicleId}
            position={[v.lat, v.lng]}
            vehicleId={v.vehicleId}
            driverId={v.driverId}
            plate={v.plate}
            vehicleModel={v.vehicleModel}
            speed={v.speed}
            heading={v.heading}
            operationalStatus={v.operationalStatus}
            online={v.online}
            updatedAt={v.timestamp ?? v.updatedAt}
          />
        ))}
      </MapContainer>

      <aside className='rounded-xl border border-border bg-panel p-4 overflow-y-auto max-h-[520px]'>
        <div className='mb-3 flex items-center justify-between gap-2'>
          <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400'>
            Veículos em Rota ({onlineCount}/{validVehicles.length})
          </h3>
          <button
            type='button'
            onClick={() => setFollowActive((v) => !v)}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${followActive ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-700 text-slate-300'}`}
          >
            {followActive ? 'Seguir veículos: ON' : 'Seguir veículos: OFF'}
          </button>
        </div>
        {validVehicles.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-16 text-slate-500 text-sm gap-2'>
            <span className='text-3xl'>📡</span>
            <p className='font-medium'>Aguardando GPS real</p>
            <p className='text-xs text-slate-600'>Motoristas online aparecerão aqui</p>
          </div>
        ) : (
          <ul className='space-y-2'>
            {validVehicles.map((v) => (
              <li key={v.vehicleId} className='rounded-lg bg-slate-900 p-3 text-sm'>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>{v.plate ?? v.vehicleId}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${statusView(v.operationalStatus, v.online).className}`}>
                    {statusView(v.operationalStatus, v.online).label}
                  </span>
                </div>
                {v.speed !== undefined && (
                  <p className='mt-1 text-xs text-slate-400'>{Math.max(0, v.speed).toFixed(0)} km/h</p>
                )}
                <p className='mt-1 text-xs text-slate-500'>
                  Atualização: {fmtLastUpdate(v.timestamp ?? v.updatedAt)}
                </p>
                <p className='mt-1 text-xs text-slate-500'>
                  Progresso da rota: {calcTrailDistanceKm(trails[v.vehicleId] ?? []).toFixed(2)} km · {trails[v.vehicleId]?.length ?? 0} pontos
                </p>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
