'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer } from 'react-leaflet';
import { RoutePolyline } from './RoutePolyline';
import { VehicleMarker } from './VehicleMarker';
import { useRealtimeStore } from '@/store/realtime.store';

const statusBadge = (online: boolean | undefined) =>
  online ? (
    <span className='rounded bg-emerald-900 px-2 py-0.5 text-xs text-emerald-300'>ON_ROUTE</span>
  ) : (
    <span className='rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400'>OFFLINE</span>
  );

export default function OperationalMap() {
  const vehicles = useRealtimeStore((s) => s.vehiclePositions);

  // Demo positions if no live data
  const demo = [
    { vehicleId: 'v1', plate: 'Van 01', lat: -23.5505, lng: -46.6333, online: true, speed: 42 },
    { vehicleId: 'v2', plate: 'Ambulância 02', lat: -23.57, lng: -46.64, online: true, speed: 0 },
    { vehicleId: 'v3', plate: 'Micro 03', lat: -23.53, lng: -46.62, online: false, speed: 0 },
  ];
  const displayVehicles = vehicles.length > 0 ? vehicles : demo;

  return (
    <div className='grid gap-4 lg:grid-cols-[1fr_300px]'>
      <MapContainer center={[-23.5505, -46.6333]} zoom={12} className='h-[520px] rounded-xl border border-border'>
        <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' attribution='&copy; OpenStreetMap contributors' />
        {displayVehicles.map((v) => (
          <VehicleMarker
            key={v.vehicleId}
            position={[v.lat, v.lng]}
            label={`${v.plate ?? v.vehicleId} | ${v.speed ?? 0} km/h`}
          />
        ))}
        <RoutePolyline points={[[-23.5505, -46.6333], [-23.57, -46.64]]} />
      </MapContainer>

      <aside className='rounded-xl border border-border bg-panel p-4 overflow-y-auto max-h-[520px]'>
        <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'>
          Veículos Ativos ({displayVehicles.filter((v) => v.online).length}/{displayVehicles.length})
        </h3>
        <ul className='space-y-2'>
          {displayVehicles.map((v) => (
            <li key={v.vehicleId} className='rounded-lg bg-slate-900 p-3 text-sm'>
              <div className='flex items-center justify-between'>
                <span className='font-medium'>{v.plate ?? v.vehicleId}</span>
                {statusBadge(v.online)}
              </div>
              {v.speed !== undefined && (
                <p className='mt-1 text-xs text-slate-400'>{v.speed} km/h</p>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
