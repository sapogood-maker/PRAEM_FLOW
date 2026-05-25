'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';

type ReplayPoint = {
  id: string;
  lat: number;
  lng: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
};

type ReplayEvent = {
  id: string;
  eventType: string;
  createdAt: string;
  source?: string | null;
  tripId?: string | null;
  patientId?: string | null;
  fromState?: string | null;
  toState?: string | null;
  metadata?: any;
};

type ReplayPayload = {
  route: any;
  points: ReplayPoint[];
  timeline: ReplayEvent[];
  metrics: {
    pointCount: number;
    durationSeconds: number;
    stoppedSeconds: number;
    stoppedMinutes: number;
    gpsGapCount: number;
    gpsGapSeconds: number;
    delayMinutes: number;
  } | null;
};

const SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

function fmtDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${ss.toString().padStart(2, '0')}s`;
  return `${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
}

function mapEventLabel(evt: ReplayEvent) {
  const eventType = evt.eventType?.toUpperCase();
  if (eventType === 'STATE_TRANSITION') {
    const raw = (evt.toState ?? evt.metadata?.toState ?? '').toUpperCase();
    const next = raw === 'IN_PROGRESS' ? 'IN_TRANSIT' : raw;
    switch (next) {
      case 'WAITING_PATIENT':
      case 'WAITING':
        return 'Rota aceita / aguardando paciente';
      case 'BOARDING':
        return 'Embarque';
      case 'BOARDED':
        return 'Paciente embarcado';
      case 'IN_TRANSIT':
        return 'Em deslocamento';
      case 'ARRIVED':
        return 'Chegada ao destino';
      case 'COMPLETED':
        return 'Concluído';
      case 'NO_SHOW':
        return 'No-show';
      default:
        return 'Transição operacional';
    }
  }
  switch (eventType) {
    case 'ROUTE_ACCEPTED':
      return 'Rota aceita';
    case 'TRIP_BOARDED':
      return 'Paciente embarcado';
    case 'TRIP_STARTED':
      return 'Em deslocamento';
    case 'TRIP_ARRIVED':
      return 'Chegada';
    case 'TRIP_COMPLETED':
      return 'Concluído';
    case 'TRIP_NO_SHOW':
      return 'No-show';
    case 'SUPERVISOR_OVERRIDE':
      return 'Override supervisor';
    case 'GPS_CHECKPOINT':
      return 'Checkpoint GPS';
    case 'RECOVERY':
    case 'RECOVERY_STALE_ROUTE':
      return 'Recuperação operacional';
    default:
      return evt.eventType ?? 'Evento operacional';
  }
}

function ReplayAutoCenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const lastMsRef = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastMsRef.current < 250) return;
    const center = map.getCenter();
    const dLat = Math.abs(center.lat - lat);
    const dLng = Math.abs(center.lng - lng);
    if (dLat < 0.0002 && dLng < 0.0002) return;
    map.panTo([lat, lng], { animate: true });
    lastMsRef.current = now;
  }, [lat, lng, map]);
  return null;
}

export default function RouteReplayPanel({ data }: { data: ReplayPayload }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  const points = useMemo(() => [...(data.points ?? [])].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp)), [data.points]);
  const timeline = useMemo(() => [...(data.timeline ?? [])].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)), [data.timeline]);
  const timelineOperational = useMemo(() => timeline.filter((evt) => evt.eventType?.toUpperCase() !== 'GPS_CHECKPOINT'), [timeline]);
  const pointTimes = useMemo(() => points.map((p) => +new Date(p.timestamp)), [points]);

  const startMs = pointTimes[0] ?? Date.now();
  const endMs = pointTimes[pointTimes.length - 1] ?? startMs;
  const durationMs = Math.max(1, endMs - startMs);

  const stopCumulative = useMemo(() => {
    const out: number[] = new Array(points.length).fill(0);
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      const prev = points[i - 1];
      const cur = points[i];
      const dt = Math.max(0, (+new Date(cur.timestamp) - +new Date(prev.timestamp)) / 1000);
      if ((prev.speed ?? 0) < 2) total += dt;
      out[i] = total;
    }
    return out;
  }, [points]);

  const gpsGaps = useMemo(() => {
    const gaps: Array<{ at: number; seconds: number }> = [];
    for (let i = 1; i < points.length; i += 1) {
      const dt = (+new Date(points[i].timestamp) - +new Date(points[i - 1].timestamp)) / 1000;
      if (dt > 90) gaps.push({ at: +new Date(points[i].timestamp), seconds: dt });
    }
    return gaps;
  }, [points]);

  useEffect(() => {
    setIsPlaying(false);
    setProgress(0);
  }, [data.route?.id]);

  useEffect(() => {
    if (!isPlaying) return;
    const loop = (now: number) => {
      const last = lastFrameRef.current ?? now;
      const delta = Math.max(0, now - last);
      lastFrameRef.current = now;
      setProgress((prev) => {
        const next = prev + (delta * speed) / durationMs;
        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = null;
    };
  }, [isPlaying, speed, durationMs]);

  const currentMs = startMs + progress * durationMs;
  const currentIndex = useMemo(() => {
    let lo = 0;
    let hi = pointTimes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pointTimes[mid] <= currentMs) lo = mid + 1;
      else hi = mid - 1;
    }
    return Math.max(0, Math.min(pointTimes.length - 1, hi));
  }, [pointTimes, currentMs]);

  const currentPosition = useMemo(() => {
    if (points.length === 0) return null;
    const a = points[currentIndex];
    const b = points[Math.min(currentIndex + 1, points.length - 1)];
    const ta = +new Date(a.timestamp);
    const tb = +new Date(b.timestamp);
    const ratio = tb === ta ? 0 : Math.max(0, Math.min(1, (currentMs - ta) / (tb - ta)));
    return {
      lat: a.lat + (b.lat - a.lat) * ratio,
      lng: a.lng + (b.lng - a.lng) * ratio,
      speed: (a.speed ?? 0) + ((b.speed ?? 0) - (a.speed ?? 0)) * ratio,
      heading: (a.heading ?? 0) + ((b.heading ?? 0) - (a.heading ?? 0)) * ratio,
      timestamp: new Date(currentMs).toISOString(),
    };
  }, [points, currentIndex, currentMs]);

  const playedPath = useMemo(() => points.slice(0, Math.max(1, currentIndex + 1)).map((p) => [p.lat, p.lng] as [number, number]), [points, currentIndex]);
  const fullPath = useMemo(() => points.map((p) => [p.lat, p.lng] as [number, number]), [points]);
  const currentEventId = useMemo(() => {
    let selected: string | null = null;
    for (const evt of timelineOperational) {
      if (+new Date(evt.createdAt) <= currentMs) selected = evt.id;
      else break;
    }
    return selected;
  }, [timelineOperational, currentMs]);
  const gpsGapsReached = useMemo(() => gpsGaps.filter((g) => g.at <= currentMs).length, [gpsGaps, currentMs]);

  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: 'replay-marker',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html: `<div style="width:26px;height:26px;border-radius:9999px;background:#0d1117;border:3px solid #22d3ee;box-shadow:0 0 0 5px rgba(34,211,238,.2)"></div>`,
      }),
    [],
  );

  if (!points.length) {
    return <div className='rounded-xl border border-border bg-panel p-6 text-sm text-slate-400'>Sem histórico GPS para esta rota.</div>;
  }

  return (
    <section className='space-y-4'>
      <div className='rounded-xl border border-border bg-panel p-4'>
        <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400'>Contexto da rota</h3>
        <p className='mt-2 text-sm text-slate-200'>
          {data.route?.origin ?? 'Origem'} → {data.route?.destination ?? 'Destino'} · Veículo {data.route?.vehicle?.plate ?? 'não informado'} · Motorista {data.route?.driver?.user?.name ?? 'não informado'}
        </p>
        <p className='mt-1 text-xs text-slate-500'>
          Multi-passageiro: {data.route?.trips?.length ?? 0} viagem(ns) · Pontos GPS: {data.metrics?.pointCount ?? points.length}
        </p>
      </div>

      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
        <div className='rounded-lg border border-border bg-panel p-3'>
          <p className='text-xs uppercase text-slate-500'>Velocidade atual</p>
          <p className='text-lg font-semibold text-slate-100'>{Math.max(0, currentPosition?.speed ?? 0).toFixed(0)} km/h</p>
        </div>
        <div className='rounded-lg border border-border bg-panel p-3'>
          <p className='text-xs uppercase text-slate-500'>Tempo parado</p>
          <p className='text-lg font-semibold text-slate-100'>{fmtDuration(stopCumulative[currentIndex] ?? 0)}</p>
        </div>
        <div className='rounded-lg border border-border bg-panel p-3'>
          <p className='text-xs uppercase text-slate-500'>Atraso operacional</p>
          <p className='text-lg font-semibold text-slate-100'>{data.metrics?.delayMinutes ?? 0} min</p>
        </div>
        <div className='rounded-lg border border-border bg-panel p-3'>
          <p className='text-xs uppercase text-slate-500'>Falhas GPS</p>
          <p className='text-lg font-semibold text-slate-100'>{gpsGapsReached}/{data.metrics?.gpsGapCount ?? gpsGaps.length}</p>
        </div>
      </div>

      <div className='rounded-xl border border-border bg-panel p-3 space-y-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            type='button'
            onClick={() => setIsPlaying((v) => !v)}
            className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600'
          >
            {isPlaying ? 'Pausar' : 'Play'}
          </button>
          <button
            type='button'
            onClick={() => {
              setProgress(0);
              setIsPlaying(false);
            }}
            className='rounded-lg border border-border bg-slate-900 px-4 py-2 text-sm text-slate-200'
          >
            Reiniciar
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}x</option>
            ))}
          </select>
          <span className='text-xs text-slate-400'>
            {new Date(currentMs).toLocaleString('pt-BR')} · {fmtDuration((currentMs - startMs) / 1000)} / {fmtDuration(durationMs / 1000)}
          </span>
        </div>
        <input
          type='range'
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            setProgress(Number(e.target.value) / 1000);
            setIsPlaying(false);
          }}
          className='w-full accent-cyan-500'
        />
      </div>

      <div className='grid gap-4 xl:grid-cols-[1fr_360px]'>
        <MapContainer center={[points[0].lat, points[0].lng]} zoom={14} className='h-[560px] rounded-xl border border-border'>
          <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' attribution='&copy; OpenStreetMap contributors' />
          <Polyline positions={fullPath} pathOptions={{ color: '#64748b', opacity: 0.4, weight: 4 }} />
          <Polyline positions={playedPath} pathOptions={{ color: '#22d3ee', opacity: 0.95, weight: 5 }} />
          {currentPosition && (
            <>
              <ReplayAutoCenter lat={currentPosition.lat} lng={currentPosition.lng} />
              <Marker position={[currentPosition.lat, currentPosition.lng]} icon={markerIcon}>
                <Popup>
                  <div className='text-xs'>
                    <p className='font-semibold'>Rota em replay</p>
                    <p>Velocidade: {Math.max(0, currentPosition.speed ?? 0).toFixed(0)} km/h</p>
                    <p>Horário: {new Date(currentPosition.timestamp).toLocaleString('pt-BR')}</p>
                  </div>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>

        <aside className='max-h-[560px] overflow-y-auto rounded-xl border border-border bg-panel p-3'>
          <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'>Timeline operacional</h3>
          <ul className='space-y-2'>
            {timelineOperational.map((evt) => (
              <li
                key={evt.id}
                className={`rounded-lg border px-3 py-2 text-xs ${
                  evt.id === currentEventId ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200' : 'border-border bg-slate-900 text-slate-300'
                }`}
              >
                <p className='font-semibold'>{mapEventLabel(evt)}</p>
                <p className='text-slate-400'>{new Date(evt.createdAt).toLocaleString('pt-BR')}</p>
                {(evt.tripId || evt.patientId) && (
                  <p className='text-slate-500'>Trip: {evt.tripId ?? '—'} · Paciente: {evt.patientId ?? '—'}</p>
                )}
              </li>
            ))}
            {timelineOperational.length === 0 && <li className='text-xs text-slate-500'>Sem eventos de timeline para esta rota.</li>}
          </ul>
        </aside>
      </div>
    </section>
  );
}
