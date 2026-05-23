'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

type VehicleMarkerProps = {
  position: [number, number];
  vehicleId: string;
  driverId?: string | null;
  plate?: string;
  vehicleModel?: string;
  speed?: number;
  heading?: number;
  operationalStatus?: string;
  online?: boolean;
  updatedAt?: string;
};

const statusColors: Record<string, string> = {
  WAITING: '#d29922',
  WAITING_PATIENT: '#d29922',
  STOPPED: '#d29922',
  BOARDING: '#388bfd',
  BOARDED: '#388bfd',
  PASSENGERS_ONBOARD: '#388bfd',
  IN_TRANSIT: '#2da44e',
  MOVING: '#2da44e',
  ONLINE: '#2da44e',
  OFFLINE: '#8b949e',
  CRITICAL: '#da3633',
  GPS_LOST: '#da3633',
};

function getOperationalLabel(status?: string) {
  switch ((status ?? '').toUpperCase()) {
    case 'WAITING':
    case 'WAITING_PATIENT':
      return 'Aguardando';
    case 'BOARDING':
      return 'Embarque';
    case 'BOARDED':
      return 'EMBARCADO';
    case 'PASSENGERS_ONBOARD':
      return 'PASSAGEIROS EMBARCADOS';
    case 'STOPPED':
      return 'Parado';
    case 'IN_TRANSIT':
    case 'MOVING':
      return 'Em deslocamento';
    case 'OFFLINE':
      return 'Offline';
    case 'CRITICAL':
    case 'GPS_LOST':
      return 'Crítico';
    case 'ONLINE':
      return 'Online';
    default:
      return 'Operacional';
  }
}

function getStatusColor(status?: string) {
  return statusColors[(status ?? '').toUpperCase()] ?? '#2da44e';
}

function formatUpdatedAt(updatedAt?: string) {
  if (!updatedAt) return 'agora';
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return 'agora';
  return d.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function VehicleMarker({
  position,
  vehicleId,
  driverId,
  plate,
  vehicleModel,
  speed,
  heading,
  operationalStatus,
  online,
  updatedAt,
}: VehicleMarkerProps) {
  const [animatedPosition, setAnimatedPosition] = useState<[number, number]>(position);
  const [animatedHeading, setAnimatedHeading] = useState<number>(heading ?? 0);
  const animationFrameRef = useRef<number | null>(null);
  const headingFrameRef = useRef<number | null>(null);
  const headingRef = useRef<number>(heading ?? 0);

  useEffect(() => {
    const [startLat, startLng] = animatedPosition;
    const [endLat, endLng] = position;
    const start = performance.now();
    const duration = 900;

    const animate = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const lat = startLat + (endLat - startLat) * eased;
      const lng = startLng + (endLng - startLng) * eased;
      setAnimatedPosition([lat, lng]);
      if (t < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [position]);

  useEffect(() => {
    const target = Number.isFinite(heading) ? heading ?? 0 : 0;
    const start = headingRef.current;
    const startAt = performance.now();
    const duration = 260;

    // shortest rotation direction
    let delta = ((target - start + 540) % 360) - 180;
    const animate = (now: number) => {
      const t = Math.min((now - startAt) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 2);
      const next = (start + delta * eased + 360) % 360;
      headingRef.current = next;
      setAnimatedHeading(next);
      if (t < 1) headingFrameRef.current = requestAnimationFrame(animate);
    };

    if (headingFrameRef.current) cancelAnimationFrame(headingFrameRef.current);
    headingFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (headingFrameRef.current) cancelAnimationFrame(headingFrameRef.current);
    };
  }, [heading]);

  const color = getStatusColor(online === false ? 'OFFLINE' : operationalStatus);
  const statusLabel = getOperationalLabel(online === false ? 'OFFLINE' : operationalStatus);
  const rotate = animatedHeading;
  const label = plate ?? vehicleId;
  const driverLabel = driverId ?? 'Não informado';
  const speedLabel = speed == null ? '—' : `${Math.max(0, speed).toFixed(0)} km/h`;

  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'vehicle-marker',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        html: `
          <style>
            @keyframes mapPulse {
              0% { transform: scale(0.85); opacity: .7; }
              70% { transform: scale(1.25); opacity: 0; }
              100% { transform: scale(1.25); opacity: 0; }
            }
          </style>
          <div style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
            ${
              online !== false
                ? `<span style="position:absolute;width:30px;height:30px;border-radius:9999px;background:${color};animation:mapPulse 1.6s infinite;"></span>`
                : ''
            }
            <div style="position:relative;z-index:2;transform-origin:center center;transform:translate(0, 0) rotate(${rotate}deg);transition:transform 180ms linear;">
              <svg width="30" height="30" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="8" y="20" width="48" height="24" rx="8" fill="#0d1117" stroke="${color}" stroke-width="4"/>
                <rect x="16" y="24" width="32" height="12" rx="4" fill="${color}" fill-opacity="0.22"/>
                <circle cx="20" cy="48" r="6" fill="#0d1117" stroke="${color}" stroke-width="3"/>
                <circle cx="44" cy="48" r="6" fill="#0d1117" stroke="${color}" stroke-width="3"/>
                <path d="M56 30L62 32L56 34V30Z" fill="${color}"/>
              </svg>
            </div>
          </div>
        `,
      }),
    [color, online, rotate],
  );

  return (
    <Marker position={animatedPosition} icon={icon}>
      <Popup>
        <div className='min-w-[220px] text-xs text-slate-200'>
          <p className='text-sm font-semibold text-slate-100'>Veículo: {label}</p>
          <p className='mt-1 text-slate-300'>Motorista: {driverLabel}</p>
          <p className='text-slate-300'>Modelo: {vehicleModel ?? 'Não informado'}</p>
          <p className='text-slate-300'>Velocidade: {speedLabel}</p>
          <p className='text-slate-300'>Status: {statusLabel}</p>
          <p className='text-slate-400'>Última atualização: {formatUpdatedAt(updatedAt)}</p>
        </div>
      </Popup>
    </Marker>
  );
}
