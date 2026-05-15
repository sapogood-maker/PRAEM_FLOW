'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer } from 'react-leaflet';
import { RoutePolyline } from './RoutePolyline';
import { VehicleMarker } from './VehicleMarker';

export default function OperationalMap() {
  return (
    <div className='grid gap-4 lg:grid-cols-[1fr_320px]'>
      <MapContainer center={[-23.5505, -46.6333]} zoom={11} className='h-[520px] rounded-xl border border-border'>
        <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' attribution='&copy; OpenStreetMap contributors' />
        <VehicleMarker position={[-23.5505, -46.6333]} label='Van 01 | Motorista Carlos | 80%' />
        <VehicleMarker position={[-23.57, -46.64]} label='Ambulância 02 | Motorista Ana | 55%' />
        <RoutePolyline points={[[-23.5505, -46.6333], [-23.57, -46.64]]} />
      </MapContainer>
      <aside className='rounded-xl border border-border bg-panel p-4'>
        <h3 className='mb-3 text-lg font-semibold'>Veículos Ativos</h3>
        <ul className='space-y-2 text-sm'>
          <li>Van 01 — ON_ROUTE</li>
          <li>Ambulância 02 — AVAILABLE</li>
        </ul>
      </aside>
    </div>
  );
}
