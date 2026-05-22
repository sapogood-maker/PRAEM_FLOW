'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
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
    case 'IN_TRANSIT':
    case 'MOVING':
    case 'ONLINE':
      return { label: 'Em deslocamento', className: 'bg-emerald-900 text-emerald-300' };
    case 'CRITICAL':
    case 'GPS_LOST':
      return { label: 'Crítico', className: 'bg-red-900 text-red-300' };
    case 'OFFLINE':
    default:
      return { label: 'Offline', className: 'bg-slate-800 text-slate-300' };
  }
}

export default function OperationalMap() {
  const vehicles = useRealtimeStore((s) => s.vehiclePositions);
  const validVehicles = useMemo(
    () => vehicles.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)),
    [vehicles],
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
      <MapContainer center={[-25.5163, -54.5854]} zoom={12} className='h-[520px] rounded-xl border border-border'>
        <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' attribution='&copy; OpenStreetMap contributors' />
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
        <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'>
          Veículos em Rota ({onlineCount}/{validVehicles.length})
        </h3>
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
                <p className='mt-1 text-xs text-slate-500'>Atualização: {v.timestamp ? new Date(v.timestamp).toLocaleTimeString('pt-BR') : 'agora'}</p>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
