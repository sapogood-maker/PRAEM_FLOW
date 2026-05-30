'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { routeService } from '@/services/operational.service';
import { getPriorityLabel, getDriverStatusLabel, getConfirmationStatusLabel } from '@/lib/i18n';
import {
  useOperationalDispatchStore,
  type DispatchQueueItem,
} from '@/store/operationalDispatch.store';
import { useRealtimeStore } from '@/store/realtime.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Driver {
  id: string;
  status: string;
  user: { name: string };
  defaultVehicleId: string | null;
}

interface Vehicle {
  id: string;
  plate: string;
  model: string;
  capacity: number;
  status: string;
}

interface HealthcareLocation {
  id: string;
  name: string;
  city: string;
  type: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  EMERGENCY: 'bg-red-600 text-white animate-pulse',
  CRITICAL: 'bg-red-900 text-red-300',
  HIGH: 'bg-amber-900 text-amber-300',
  NORMAL: 'bg-slate-700 text-slate-300',
  LOW: 'bg-slate-800 text-slate-500',
};

const MOBILITY_ICON: Record<string, string> = {
  NORMAL: '🚶',
  WHEELCHAIR: '♿',
  STRETCHER: '🛏',
  OXYGEN: '💨',
};

const CONFIRMATION_BADGE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-900 text-emerald-300',
  PENDING: 'bg-amber-900 text-amber-300',
  CANCELED: 'bg-red-900 text-red-300',
  UNREACHABLE: 'bg-slate-800 text-slate-400',
  WAITING_MANUAL_CONFIRMATION: 'bg-cyan-900 text-cyan-300',
};

const DRIVER_STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'bg-emerald-900 text-emerald-300',
  ON_ROUTE: 'bg-amber-900 text-amber-300',
  REST: 'bg-blue-900 text-blue-300',
  OFFLINE: 'bg-slate-800 text-slate-500',
};

// ─── Helper: group staging items by destination ───────────────────────────────

interface DestinationGroup {
  key: string;
  label: string;
  city: string;
  items: DispatchQueueItem[];
}

function groupByDestination(items: DispatchQueueItem[]): DestinationGroup[] {
  const map = new Map<string, DestinationGroup>();
  for (const item of items) {
    const key =
      item.healthcareLocation?.id ?? item.destination ?? 'sem-destino';
    const label =
      item.healthcareLocation?.name ?? item.destination ?? 'Destino não informado';
    const city = item.healthcareLocation?.city ?? '';
    if (!map.has(key)) {
      map.set(key, { key, label, city, items: [] });
    }
    map.get(key)!.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => {
    const aHasEmergency = a.items.some((i) => i.priority === 'EMERGENCY');
    const bHasEmergency = b.items.some((i) => i.priority === 'EMERGENCY');
    if (aHasEmergency !== bHasEmergency) return aHasEmergency ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

// ─── Patient Card ─────────────────────────────────────────────────────────────

function PatientCard({
  item,
  onRemove,
}: {
  item: DispatchQueueItem;
  onRemove: () => void;
}) {
  const apptDate = item.appointmentDate ? new Date(item.appointmentDate) : null;

  return (
    <div className='flex items-start gap-3 rounded-lg border border-slate-700/60 bg-slate-800/60 p-3 transition-colors hover:bg-slate-800'>
      <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-base'>
        {MOBILITY_ICON[item.patient?.mobility] ?? '🚶'}
      </div>
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='font-medium text-slate-100 truncate'>
            👤 {item.patient?.name ?? item.patientId}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${PRIORITY_COLOR[item.priority] ?? 'bg-slate-700 text-slate-300'}`}
          >
            ⚠️ {getPriorityLabel(item.priority)}
          </span>
        </div>
        <div className='flex flex-wrap items-center gap-2 text-xs text-slate-400'>
          {apptDate && (
            <span>
              📅{' '}
              {apptDate.toLocaleString('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </span>
          )}
          {item.healthcareLocation?.city && (
            <span>📍 {item.healthcareLocation.city}</span>
          )}
          {item.confirmationStatus && (
            <span
              className={`rounded px-1.5 py-0.5 font-medium ${CONFIRMATION_BADGE[item.confirmationStatus] ?? 'text-slate-400'}`}
            >
              {item.confirmationStatus === 'CONFIRMED' ? '✅ ' : ''}
              {getConfirmationStatusLabel(item.confirmationStatus)}
            </span>
          )}
        </div>
      </div>
      <button
        type='button'
        onClick={onRemove}
        title='Remover do despacho — volta para fila'
        className='shrink-0 rounded p-1 text-slate-500 transition-colors hover:bg-red-950/50 hover:text-red-400'
      >
        ✕
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DispatchPage() {
  const qc = useQueryClient();
  const revision = useRealtimeStore((s) => s.revision);

  const {
    pendingDispatch,
    removeFromDispatch,
    clearDispatch,
    currentRouteDraft,
    updateRouteDraft,
    clearRouteDraft,
  } = useOperationalDispatchStore();

  // selectedPatients is always derived from pendingDispatch — no independent state
  const selectedPatients = pendingDispatch.map((p) => p.id);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: driversData } = useQuery({
    queryKey: ['dispatch-drivers'],
    queryFn: () => api.get('/drivers', { params: { limit: 100 } }).then((r) => r.data),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['dispatch-vehicles'],
    queryFn: () => api.get('/vehicles', { params: { limit: 100 } }).then((r) => r.data),
  });

  const { data: locationsData } = useQuery({
    queryKey: ['dispatch-locations'],
    queryFn: () => api.get('/healthcare-locations', { params: { limit: 100 } }).then((r) => r.data),
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['dispatch-queue'] });
    qc.invalidateQueries({ queryKey: ['trips'] });
    qc.invalidateQueries({ queryKey: ['routes'] });
  }, [revision, qc]);

  const drivers: Driver[] = driversData?.items ?? driversData ?? [];
  const vehicles: Vehicle[] = vehiclesData?.items ?? vehiclesData ?? [];
  const locations: HealthcareLocation[] = locationsData?.items ?? locationsData ?? [];

  const { driverId, vehicleId, locationId, origin, dispatchType, scheduledDate, scheduledTime } =
    currentRouteDraft;

  // ── Computed ───────────────────────────────────────────────────────────────

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const overCapacity = selectedVehicle ? selectedPatients.length > selectedVehicle.capacity : false;
  const scheduledAt =
    dispatchType === 'SCHEDULED' && scheduledDate
      ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
      : null;
  const todayIso = new Date().toISOString().split('T')[0];
  const groups = groupByDestination(pendingDispatch);
  const canDispatch =
    selectedPatients.length > 0 &&
    !!locationId &&
    !overCapacity &&
    (dispatchType === 'IMMEDIATE' || !!scheduledDate);

  // ── Dispatch mutation ──────────────────────────────────────────────────────

  const dispatch = useMutation({
    mutationFn: async (patientIds?: string[]) => {
      const idsToDispatch = patientIds ?? selectedPatients;
      const selectedQueueItems = pendingDispatch.filter((q) => idsToDispatch.includes(q.id));
      const queueIds = selectedQueueItems.map((q) => q.id);
      const result = await routeService.dispatchOperation({
        queueIds,
        locationId: locationId || undefined,
        origin,
        dispatchType,
        scheduledAt: scheduledAt ?? undefined,
        date: scheduledAt ?? new Date().toISOString(),
        ...(driverId ? { driverId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
        sendPatientNotifications: true,
        sendBoardingQr: true,
      });
      return { routeId: result.routeId as string, patientCount: selectedQueueItems.length };
    },
    onSuccess: ({ patientCount }) => {
      clearDispatch();
      clearRouteDraft();
      qc.invalidateQueries({ queryKey: ['dispatch-queue'] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['queue'] });
      const label = dispatchType === 'SCHEDULED' ? '📅 Rota agendada' : '✅ Rota despachada';
      alert(`${label} com ${patientCount} paciente(s).${dispatchType === 'IMMEDIATE' ? ' Motorista notificado via Flutter.' : ''}`);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.message ?? 'Erro ao despachar rota.');
    },
  });

  function dispatchGroup(group: DestinationGroup) {
    const loc = locations.find((l) => l.name === group.label || l.id === group.key);
    const activeLocationId = loc ? loc.id : locationId;
    updateRouteDraft({ locationId: activeLocationId });
    const ids = group.items.map((i) => i.id);
    // Temporarily set locationId for this dispatch
    if (!locationId && !loc) {
      alert('Selecione o destino médico no formulário antes de despachar o grupo.');
      return;
    }
    dispatch.mutate(ids);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>⚡ Central de Despacho</h2>
          <p className='text-sm text-slate-400'>
            Torre logística TFD — selecione pacientes na{' '}
            <a href='/queue' className='text-cyan-400 underline'>
              Fila Operacional
            </a>{' '}
            e configure a rota aqui
          </p>
        </div>
        {pendingDispatch.length > 0 && (
          <button
            type='button'
            onClick={() => {
              if (confirm('Limpar todos os pacientes do staging de despacho?')) clearDispatch();
            }}
            className='rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:border-red-800 hover:text-red-400'
          >
            🗑 Limpar Staging
          </button>
        )}
      </div>

      <div className='grid gap-6 xl:grid-cols-[1fr_400px]'>
        {/* ── Staging area ────────────────────────────────────────────────── */}
        <div className='space-y-4'>
          {/* Status bar */}
          <div className='flex items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3'>
            <span
              className={`h-2.5 w-2.5 rounded-full ${pendingDispatch.length > 0 ? 'animate-pulse bg-cyan-400' : 'bg-slate-600'}`}
            />
            <span className='text-sm font-semibold text-slate-200'>
              {pendingDispatch.length > 0
                ? `${pendingDispatch.length} paciente(s) aguardando despacho`
                : 'Nenhum paciente em staging'}
            </span>
            {pendingDispatch.length > 0 && (
              <span className='ml-auto text-xs text-slate-500'>
                {groups.length} grupo(s) por destino
              </span>
            )}
          </div>

          {/* Empty state */}
          {pendingDispatch.length === 0 && (
            <div className='rounded-xl border-2 border-dashed border-slate-700 p-10 text-center space-y-3'>
              <p className='text-3xl'>🚐</p>
              <p className='font-medium text-slate-300'>Pacientes aguardando despacho</p>
              <p className='text-sm text-slate-500'>
                Vá para a{' '}
                <a href='/queue' className='font-medium text-cyan-400 underline'>
                  Fila Operacional
                </a>{' '}
                e clique em{' '}
                <span className='font-medium text-cyan-300'>→ Despacho</span> ou arraste
                pacientes para iniciar o workflow.
              </p>
            </div>
          )}

          {/* Destination groups */}
          {groups.map((group) => (
            <div
              key={group.key}
              className='overflow-hidden rounded-xl border border-border bg-panel'
            >
              {/* Group header */}
              <div className='flex items-center justify-between border-b border-border bg-slate-900/60 px-4 py-3'>
                <div className='flex items-center gap-2'>
                  <span className='text-base'>🏥</span>
                  <div>
                    <p className='font-semibold text-slate-100'>{group.label}</p>
                    {group.city && <p className='text-xs text-slate-500'>📍 {group.city}</p>}
                  </div>
                  <span className='rounded-full bg-cyan-900/60 px-2 py-0.5 text-xs text-cyan-300'>
                    {group.items.length} paciente(s)
                  </span>
                </div>
                <button
                  type='button'
                  onClick={() => dispatchGroup(group)}
                  disabled={dispatch.isPending}
                  className='rounded-lg bg-cyan-800/60 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-700 disabled:opacity-40'
                >
                  🚐 Despachar grupo
                </button>
              </div>

              {/* Patient cards */}
              <div className='divide-y divide-border/50'>
                {group.items.map((item) => (
                  <div key={item.id} className='px-4 py-2'>
                    <PatientCard item={item} onRemove={() => removeFromDispatch(item.id)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Dispatch form ────────────────────────────────────────────────── */}
        <div className='space-y-4 self-start rounded-xl border border-border bg-panel p-4'>
          <div className='flex items-center justify-between border-b border-border pb-2'>
            <h3 className='font-semibold text-slate-100'>⚙️ Configurar Rota</h3>
            {(driverId || vehicleId || locationId) && (
              <button
                type='button'
                onClick={clearRouteDraft}
                className='text-xs text-slate-500 transition-colors hover:text-slate-300'
              >
                Limpar
              </button>
            )}
          </div>

          {/* Dispatch type */}
          <div className='flex overflow-hidden rounded-lg border border-border text-sm font-medium'>
            <button
              type='button'
              onClick={() => updateRouteDraft({ dispatchType: 'IMMEDIATE' })}
              className={`flex-1 py-2 transition-colors ${
                dispatchType === 'IMMEDIATE'
                  ? 'bg-cyan-700 text-white'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              🚀 Imediato
            </button>
            <button
              type='button'
              onClick={() => updateRouteDraft({ dispatchType: 'SCHEDULED' })}
              className={`flex-1 py-2 transition-colors ${
                dispatchType === 'SCHEDULED'
                  ? 'bg-indigo-700 text-white'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              📅 Agendar
            </button>
          </div>

          {dispatchType === 'SCHEDULED' && (
            <div className='space-y-2 rounded-lg border border-indigo-900/50 bg-indigo-950/20 p-3'>
              <p className='text-xs font-semibold uppercase tracking-wider text-indigo-300'>
                Data e Hora do Despacho
              </p>
              <div className='grid grid-cols-2 gap-2'>
                <div className='space-y-1'>
                  <label className='text-xs text-slate-400'>Data</label>
                  <input
                    type='date'
                    value={scheduledDate}
                    min={todayIso}
                    onChange={(e) => updateRouteDraft({ scheduledDate: e.target.value })}
                    className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none'
                  />
                </div>
                <div className='space-y-1'>
                  <label className='text-xs text-slate-400'>Hora</label>
                  <input
                    type='time'
                    value={scheduledTime}
                    onChange={(e) => updateRouteDraft({ scheduledTime: e.target.value })}
                    className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none'
                  />
                </div>
              </div>
            </div>
          )}

          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>Origem</label>
            <input
              type='text'
              value={origin}
              onChange={(e) => updateRouteDraft({ origin: e.target.value })}
              className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
              placeholder='Ex: Prefeitura Municipal'
            />
          </div>

          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>
              Destino Médico *
            </label>
            <select
              value={locationId}
              onChange={(e) => updateRouteDraft({ locationId: e.target.value })}
              className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
            >
              <option value=''>— Selecionar destino —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.city}
                </option>
              ))}
            </select>
          </div>

          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>
              Motorista{' '}
              {dispatchType === 'SCHEDULED' && (
                <span className='normal-case text-slate-500'>(opcional)</span>
              )}
            </label>
            <select
              value={driverId}
              onChange={(e) => updateRouteDraft({ driverId: e.target.value })}
              className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
            >
              <option value=''>— Selecionar motorista —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user?.name}
                  {d.status && ` · ${getDriverStatusLabel(d.status)}`}
                </option>
              ))}
            </select>
            {driverId &&
              (() => {
                const d = drivers.find((dr) => dr.id === driverId);
                if (!d) return null;
                return (
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${DRIVER_STATUS_BADGE[d.status] ?? 'bg-slate-800 text-slate-400'}`}
                  >
                    {getDriverStatusLabel(d.status)}
                  </span>
                );
              })()}
          </div>

          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>
              Veículo{' '}
              {dispatchType === 'SCHEDULED' && (
                <span className='normal-case text-slate-500'>(opcional)</span>
              )}
            </label>
            <select
              value={vehicleId}
              onChange={(e) => updateRouteDraft({ vehicleId: e.target.value })}
              className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
            >
              <option value=''>— Selecionar veículo —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.model} · {v.capacity}p
                </option>
              ))}
            </select>
            {overCapacity && (
              <p className='text-xs text-red-400'>
                ⚠ Pacientes ({selectedPatients.length}) excedem a capacidade (
                {selectedVehicle?.capacity}).
              </p>
            )}
          </div>

          {/* Summary */}
          {selectedPatients.length > 0 && (
            <div className='space-y-1 rounded-lg border border-cyan-900/50 bg-cyan-950/20 p-3 text-xs text-cyan-300'>
              <p className='font-semibold uppercase tracking-wider'>Resumo da Rota</p>
              <p>👥 Pacientes: {selectedPatients.length}</p>
              {dispatchType === 'SCHEDULED' && scheduledDate && (
                <p>
                  📅 Agendado:{' '}
                  {new Date(`${scheduledDate}T${scheduledTime}:00`).toLocaleString('pt-BR')}
                </p>
              )}
              {selectedVehicle && (
                <p>
                  🚐 Veículo: {selectedVehicle.plate} ({selectedVehicle.capacity} lugares)
                </p>
              )}
              {locationId && (
                <p>🏥 Destino: {locations.find((l) => l.id === locationId)?.name}</p>
              )}
              {!driverId && dispatchType === 'SCHEDULED' && (
                <p className='text-slate-400'>🚗 Motorista: a atribuir</p>
              )}
            </div>
          )}

          <button
            type='button'
            disabled={!canDispatch || dispatch.isPending}
            onClick={() => dispatch.mutate(undefined)}
            className={`w-full rounded-lg px-4 py-3 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              dispatchType === 'SCHEDULED'
                ? 'bg-indigo-700 hover:bg-indigo-600'
                : 'bg-cyan-700 hover:bg-cyan-600'
            }`}
          >
            {dispatch.isPending
              ? '⏳ Processando…'
              : dispatchType === 'SCHEDULED'
                ? `📅 Agendar Rota (${selectedPatients.length} paciente(s))`
                : `🚨 Despachar Operação (${selectedPatients.length} paciente(s))`}
          </button>

          {selectedPatients.length === 0 && (
            <p className='text-center text-xs text-slate-500'>
              Selecione ao menos 1 paciente na{' '}
              <a href='/queue' className='text-cyan-400 underline'>
                Fila Operacional
              </a>
            </p>
          )}
          {!locationId && selectedPatients.length > 0 && (
            <p className='text-center text-xs text-amber-400'>
              ⚠ Selecione o destino médico para liberar o despacho
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
