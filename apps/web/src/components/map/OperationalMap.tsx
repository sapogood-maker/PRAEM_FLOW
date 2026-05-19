'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer } from 'react-leaflet';
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

  return (
    <div className='grid gap-4 lg:grid-cols-[1fr_300px]'>
      <MapContainer center={[-25.5163, -54.5854]} zoom={12} className='h-[520px] rounded-xl border border-border'>
        <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' attribution='&copy; OpenStreetMap contributors' />
        {vehicles.map((v) => (
          <VehicleMarker
            key={v.vehicleId}
            position={[v.lat, v.lng]}
            label={`${v.plate ?? v.vehicleId} | ${v.speed ?? 0} km/h`}
          />
        ))}
      </MapContainer>

      <aside className='rounded-xl border border-border bg-panel p-4 overflow-y-auto max-h-[520px]'>
        <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'>
          Veículos em Rota ({vehicles.filter((v) => v.online).length}/{vehicles.length})
        </h3>
        {vehicles.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-16 text-slate-500 text-sm gap-2'>
            <span className='text-3xl'>📡</span>
            <p className='font-medium'>Aguardando GPS real</p>
            <p className='text-xs text-slate-600'>Motoristas online aparecerão aqui</p>
          </div>
        ) : (
          <ul className='space-y-2'>
            {vehicles.map((v) => (
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
        )}
      </aside>
    </div>
  );
}
