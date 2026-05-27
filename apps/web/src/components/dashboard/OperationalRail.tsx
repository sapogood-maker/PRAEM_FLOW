'use client';

import { useMemo } from 'react';
import { AlertTriangle, Clock3, Gauge, MapPin, Truck, Wifi, WifiOff } from 'lucide-react';
import type { ActivityEvent, QueueItem, VehiclePosition } from '@/types';
import { UI_TEXT } from '@/lib/ui-text';

type OperationalQueueItem = QueueItem & {
  patient?: { name?: string; mobility?: string; specialNeeds?: string | null };
  healthcareLocation?: { name?: string; city?: string; latitude?: number; longitude?: number };
  notes?: string | null;
};

type OperationalRailProps = {
  queueItems: OperationalQueueItem[];
  alerts: ActivityEvent[];
  vehicles: VehiclePosition[];
  connected: boolean;
};

function minutesUntil(iso?: string | null) {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const delta = Math.round((target - Date.now()) / 60000);
  return delta;
}

function statusTone(status?: string, online?: boolean) {
  if (online === false) return 'bg-slate-800 text-slate-400 ring-slate-700/60';
  switch ((status ?? '').toUpperCase()) {
    case 'BOARDING':
      return 'bg-amber-500/10 text-amber-300 ring-amber-500/20';
    case 'STOPPED':
    case 'WAITING':
      return 'bg-yellow-500/10 text-yellow-300 ring-yellow-500/20';
    case 'CRITICAL':
    case 'GPS_LOST':
    case 'OFFLINE':
      return 'bg-red-500/10 text-red-300 ring-red-500/20';
    default:
      return 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20';
  }
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function OperationalRail({ queueItems, alerts, vehicles, connected }: OperationalRailProps) {
  const pickups = useMemo(
    () =>
      [...queueItems]
        .filter((item) => item.status !== 'CANCELLED')
        .sort((a, b) => +new Date(a.appointmentDate) - +new Date(b.appointmentDate))
        .slice(0, 6),
    [queueItems],
  );

  const criticalAlerts = useMemo(() => alerts.filter((event) => event.type === 'alert').slice(0, 6), [alerts]);

  const fleetSummary = useMemo(() => {
    const total = vehicles.length;
    const online = vehicles.filter((v) => v.online !== false).length;
    const moving = vehicles.filter((v) => (v.operationalStatus ?? '').toUpperCase() === 'IN_TRANSIT' || (v.operationalStatus ?? '').toUpperCase() === 'MOVING').length;
    const boarding = vehicles.filter((v) => (v.operationalStatus ?? '').toUpperCase() === 'BOARDING').length;
    const offline = total - online;
    return { total, online, moving, boarding, offline };
  }, [vehicles]);

  return (
    <aside className='space-y-4 xl:sticky xl:top-4'>
      <section className='rounded-[24px] border border-white/5 bg-slate-950/80 p-4 shadow-2xl backdrop-blur-xl'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>{UI_TEXT.operationalRail.upcomingPickups}</p>
            <p className='mt-1 text-sm text-slate-300'>{pickups.length} {UI_TEXT.operationalRail.livePickupWindows}</p>
          </div>
          <Clock3 size={16} className='text-cyan-300' />
        </div>
        <div className='mt-4 space-y-3 max-h-[260px] overflow-y-auto pr-1'>
          {pickups.length === 0 ? (
            <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-sm text-slate-500'>
              {UI_TEXT.operationalRail.noPickupWindows}
            </div>
          ) : (
            pickups.map((item) => {
              const etaMinutes = minutesUntil(item.appointmentDate);
              const etaLabel =
                etaMinutes == null ? UI_TEXT.operationalRail.etaLive : etaMinutes <= 0 ? UI_TEXT.operationalRail.etaNow : `ETA ${etaMinutes}m`;
              const mobility = item.patient?.mobility ? item.patient.mobility.toLowerCase() : 'standard';
              return (
                <div key={item.id} className='rounded-2xl border border-white/5 bg-white/5 p-3 ring-1 ring-white/5'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium text-slate-100'>{item.patient?.name ?? item.patientId}</p>
                      <p className='mt-1 text-xs text-slate-400'>
                        {item.healthcareLocation?.name ?? item.destination ?? UI_TEXT.operationalRail.destination} · {formatTime(item.appointmentDate)}
                      </p>
                    </div>
                    <span className='rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 ring-1 ring-cyan-500/20'>
                      {etaLabel}
                    </span>
                  </div>
                  <div className='mt-3 flex items-center gap-2 text-[11px] text-slate-400'>
                    <span className='rounded-full bg-white/5 px-2 py-1 uppercase tracking-[0.24em] text-slate-400'>{mobility}</span>
                    <span className={`rounded-full px-2 py-1 ring-1 ${statusTone(item.status)}`}>{item.priority ?? 'NORMAL'}</span>
                    {item.notes && <span className='truncate text-slate-500'>{item.notes}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className='rounded-[24px] border border-white/5 bg-slate-950/80 p-4 shadow-2xl backdrop-blur-xl'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>{UI_TEXT.operationalRail.criticalAlerts}</p>
            <p className='mt-1 text-sm text-slate-300'>{criticalAlerts.length} {UI_TEXT.operationalRail.activeSignals}</p>
          </div>
          <AlertTriangle size={16} className='text-red-300' />
        </div>
        <div className='mt-4 space-y-2 max-h-[230px] overflow-y-auto pr-1'>
          {criticalAlerts.length === 0 ? (
            <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-sm text-slate-500'>
              {UI_TEXT.operationalRail.noCriticalAlerts}
            </div>
          ) : (
            criticalAlerts.map((event) => (
              <div key={event.id} className='flex items-start gap-3 rounded-2xl border border-red-500/10 bg-red-500/5 px-3 py-3'>
                <span className='mt-1 h-2 w-2 rounded-full bg-red-300 shadow-[0_0_0_6px_rgba(248,113,113,0.08)]' />
                <div className='min-w-0 flex-1'>
                  <p className='text-sm text-slate-100'>{event.message}</p>
                  <p className='mt-1 text-xs text-slate-500'>
                    {new Date(event.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className='rounded-[24px] border border-white/5 bg-slate-950/80 p-4 shadow-2xl backdrop-blur-xl'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>{UI_TEXT.operationalRail.fleetStatus}</p>
            <p className='mt-1 text-sm text-slate-300'>
              {fleetSummary.online}/{fleetSummary.total} {UI_TEXT.operationalRail.connected}
            </p>
          </div>
          {connected ? <Wifi size={16} className='text-emerald-300' /> : <WifiOff size={16} className='text-slate-500' />}
        </div>

        <div className='mt-4 grid grid-cols-2 gap-2'>
          <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
            <p className='text-[11px] uppercase tracking-[0.25em] text-slate-500'>{UI_TEXT.operationalRail.moving}</p>
            <p className='mt-1 text-lg font-semibold text-slate-100'>{fleetSummary.moving}</p>
          </div>
          <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
            <p className='text-[11px] uppercase tracking-[0.25em] text-slate-500'>{UI_TEXT.operationalRail.boarding}</p>
            <p className='mt-1 text-lg font-semibold text-slate-100'>{fleetSummary.boarding}</p>
          </div>
          <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
            <p className='text-[11px] uppercase tracking-[0.25em] text-slate-500'>{UI_TEXT.operationalRail.offline}</p>
            <p className='mt-1 text-lg font-semibold text-slate-100'>{fleetSummary.offline}</p>
          </div>
          <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
            <p className='text-[11px] uppercase tracking-[0.25em] text-slate-500'>{UI_TEXT.operationalRail.live}</p>
            <p className='mt-1 text-lg font-semibold text-slate-100'>{fleetSummary.online}</p>
          </div>
        </div>

        <div className='mt-4 space-y-2 max-h-[220px] overflow-y-auto pr-1'>
          {vehicles.length === 0 ? (
            <div className='rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-sm text-slate-500'>
              {UI_TEXT.operationalRail.noVehiclesReporting}
            </div>
          ) : (
            vehicles.slice(0, 6).map((vehicle) => {
              const online = vehicle.online !== false;
              const status = vehicle.operationalStatus ?? 'MOVING';
              return (
                <div key={vehicle.vehicleId} className='rounded-2xl border border-white/5 bg-white/5 px-3 py-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='truncate text-sm font-medium text-slate-100'>{vehicle.plate ?? vehicle.vehicleId}</p>
                      <p className='mt-1 text-xs text-slate-500'>
                        {vehicle.driverName ?? vehicle.driverId ?? UI_TEXT.operationalRail.driverPending} · {formatTime(vehicle.updatedAt ?? vehicle.timestamp)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusTone(status, online)}`}>
                      {status}
                    </span>
                  </div>
                  <div className='mt-2 flex items-center gap-3 text-xs text-slate-500'>
                    <span className='inline-flex items-center gap-1'>
                      <Gauge size={12} />
                      {vehicle.speed != null ? `${Math.max(0, vehicle.speed).toFixed(0)} km/h` : '—'}
                    </span>
                    <span className='inline-flex items-center gap-1'>
                      <MapPin size={12} />
                      {online ? UI_TEXT.operationalRail.tracking : UI_TEXT.operationalRail.offline.toLowerCase()}
                    </span>
                    <span className='inline-flex items-center gap-1'>
                      <Truck size={12} />
                      {online ? UI_TEXT.operationalRail.live.toLowerCase() : UI_TEXT.operationalRail.stale}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </aside>
  );
}
