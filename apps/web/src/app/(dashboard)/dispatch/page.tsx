'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { getPriorityLabel, getDriverStatusLabel } from '@/lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueItem {
  id: string;
  patientId: string;
  priority: string;
  status: string;
  destination: string | null;
  healthcareLocationId: string | null;
  appointmentDate: string;
  patient: { id: string; name: string; mobility: string; clinicalRisk: string };
  healthcareLocation?: { id: string; name: string; latitude: number | null; longitude: number | null } | null;
}

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

// ─── Priority helpers ─────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  EMERGENCY: 'bg-red-600 text-white',
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

const DRIVER_STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'bg-emerald-900 text-emerald-300',
  ON_ROUTE: 'bg-amber-900 text-amber-300',
  REST: 'bg-blue-900 text-blue-300',
  OFFLINE: 'bg-slate-800 text-slate-500',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DispatchPage() {
  const qc = useQueryClient();
  const [selectedPatients, setSelectedPatients] = useState<string[]>([]);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [origin, setOrigin] = useState('Prefeitura Municipal');
  const [dispatchType, setDispatchType] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['dispatch-queue'],
    queryFn: () =>
      api
        .get('/queues', { params: { status: 'WAITING,CALLED,CONFIRMED,ASSIGNED,SCHEDULED', limit: 100 } })
        .then((r) => r.data),
    refetchInterval: 15_000,
  });

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

  const queueItems: QueueItem[] = queueData?.items ?? queueData ?? [];
  const drivers: Driver[] = driversData?.items ?? driversData ?? [];
  const vehicles: Vehicle[] = vehiclesData?.items ?? vehiclesData ?? [];
  const locations: HealthcareLocation[] = locationsData?.items ?? locationsData ?? [];

  // ── Selected vehicle capacity check ───────────────────────────────────────
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const overCapacity = selectedVehicle ? selectedPatients.length > selectedVehicle.capacity : false;

  // ── Computed scheduledAt ───────────────────────────────────────────────────
  const scheduledAt =
    dispatchType === 'SCHEDULED' && scheduledDate
      ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
      : null;

  // ── Dispatch mutation ──────────────────────────────────────────────────────

  const dispatch = useMutation({
    mutationFn: async () => {
      const loc = locations.find((l) => l.id === locationId);
      const destinationName = loc?.name ?? 'Destino não informado';

      const routePayload: Record<string, unknown> = {
        origin,
        destination: destinationName,
        date: scheduledAt ?? new Date().toISOString(),
        scheduledAt: scheduledAt ?? null,
        dispatchType,
        status: dispatchType === 'SCHEDULED' ? 'SCHEDULED' : 'PLANNED',
        ...(driverId && { driverId }),
        ...(vehicleId && { vehicleId }),
      };

      // 1. Create route
      const routeRes = await api.post('/routes', routePayload);
      const route = routeRes.data;

      // 2. Create a trip for each selected queue entry (queue item → patient)
      const selectedQueueItems = queueItems.filter((q) => selectedPatients.includes(q.id));
      await Promise.all(
        selectedQueueItems.map((q) =>
          api.post('/trips', { routeId: route.id, patientId: q.patientId }),
        ),
      );

      return { routeId: route.id, patientCount: selectedQueueItems.length };
    },
    onSuccess: ({ routeId, patientCount }) => {
      const label = dispatchType === 'SCHEDULED' ? '📅 Rota agendada' : '✅ Rota despachada';
      setSuccessMsg(
        `${label} (${routeId.slice(0, 8)}…) com ${patientCount} paciente(s).${dispatchType === 'IMMEDIATE' ? ' Motorista notificado via Flutter.' : ''}`,
      );
      setErrorMsg('');
      setSelectedPatients([]);
      setDriverId('');
      setVehicleId('');
      setLocationId('');
      setScheduledDate('');
      setScheduledTime('08:00');
      qc.invalidateQueries({ queryKey: ['dispatch-queue'] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['routes'] });
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message ?? 'Erro ao despachar rota.');
    },
  });

  // Dispatch is allowed as long as origin + destination + ≥1 patient are set.
  // Driver and vehicle are OPTIONAL for scheduled routes (assigned later by operations).
  const canDispatch =
    selectedPatients.length > 0 &&
    !!locationId &&
    !overCapacity &&
    (dispatchType === 'IMMEDIATE' || !!scheduledDate);

  function togglePatient(queueId: string) {
    setSelectedPatients((prev) =>
      prev.includes(queueId) ? prev.filter((id) => id !== queueId) : [...prev, queueId],
    );
  }

  const todayIso = new Date().toISOString().split('T')[0];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className='space-y-6'>
      {/* Header */}
      <div>
        <h2 className='text-2xl font-bold text-slate-100'>Central de Despacho</h2>
        <p className='text-sm text-slate-400'>
          Despacho imediato ou agendamento futuro — motorista e veículo são opcionais para rotas agendadas
        </p>
      </div>

      {successMsg && (
        <div className='rounded-lg border border-emerald-700 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300'>
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className='rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300'>
          {errorMsg}
        </div>
      )}

      <div className='grid gap-6 xl:grid-cols-[1fr_380px]'>
        {/* ── Patient queue ───────────────────────────────────────────────── */}
        <div className='rounded-xl border border-border bg-panel'>
          <div className='flex items-center justify-between border-b border-border px-4 py-3'>
            <h3 className='font-semibold text-slate-100'>Pacientes Aguardando Despacho</h3>
            <span className='rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400'>
              {selectedPatients.length} selecionado(s)
            </span>
          </div>

          {queueLoading ? (
            <div className='flex items-center justify-center p-8'>
              <LoadingSpinner />
            </div>
          ) : queueItems.length === 0 ? (
            <p className='p-6 text-center text-slate-500'>
              Nenhum paciente aguardando despacho ou com agendamento futuro.
            </p>
          ) : (
            <ul className='divide-y divide-border'>
              {queueItems.map((q) => {
                const isSelected = selectedPatients.includes(q.id);
                return (
                  <li
                    key={q.id}
                    onClick={() => togglePatient(q.id)}
                    className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
                      isSelected
                        ? 'bg-cyan-950/40 border-l-2 border-l-cyan-600'
                        : 'hover:bg-slate-900/40'
                    }`}
                  >
                    <input
                      type='checkbox'
                      readOnly
                      checked={isSelected}
                      className='mt-1 accent-cyan-500'
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => togglePatient(q.id)}
                    />
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <span className='font-medium text-slate-100 truncate'>
                          {q.patient?.name}
                        </span>
                        <span className='text-base'>
                          {MOBILITY_ICON[q.patient?.mobility] ?? '🚶'}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            PRIORITY_COLOR[q.priority] ?? 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {getPriorityLabel(q.priority)}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            q.status === 'CONFIRMED'
                              ? 'bg-emerald-900 text-emerald-300'
                              : q.status === 'CALLED'
                                ? 'bg-amber-900 text-amber-300'
                                : q.status === 'SCHEDULED'
                                  ? 'bg-indigo-900 text-indigo-300'
                                  : q.status === 'ASSIGNED'
                                    ? 'bg-cyan-900 text-cyan-300'
                                    : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {q.status === 'CONFIRMED'
                            ? '✓ Confirmado'
                            : q.status === 'CALLED'
                              ? 'Chamado'
                              : q.status === 'SCHEDULED'
                                ? '📅 Agendado'
                                : q.status === 'ASSIGNED'
                                  ? '✓ Atribuído'
                                  : 'Aguardando'}
                        </span>
                      </div>
                      <p className='mt-0.5 text-xs text-slate-400 truncate'>
                        {q.healthcareLocation?.name ?? q.destination ?? '—'}
                        {' · '}
                        {new Date(q.appointmentDate).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Dispatch form ───────────────────────────────────────────────── */}
        <div className='rounded-xl border border-border bg-panel p-4 space-y-4 self-start'>
          <h3 className='font-semibold text-slate-100 border-b border-border pb-2'>
            Configurar Rota
          </h3>

          {/* Dispatch type toggle */}
          <div className='flex rounded-lg overflow-hidden border border-border text-sm font-medium'>
            <button
              type='button'
              onClick={() => setDispatchType('IMMEDIATE')}
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
              onClick={() => setDispatchType('SCHEDULED')}
              className={`flex-1 py-2 transition-colors ${
                dispatchType === 'SCHEDULED'
                  ? 'bg-indigo-700 text-white'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
              }`}
            >
              📅 Agendar
            </button>
          </div>

          {/* Scheduled date + time */}
          {dispatchType === 'SCHEDULED' && (
            <div className='space-y-2 rounded-lg border border-indigo-900/50 bg-indigo-950/20 p-3'>
              <p className='text-xs text-indigo-300 font-semibold uppercase tracking-wider'>
                Data e Hora do Despacho
              </p>
              <div className='grid grid-cols-2 gap-2'>
                <div className='space-y-1'>
                  <label className='text-xs text-slate-400'>Data</label>
                  <input
                    type='date'
                    value={scheduledDate}
                    min={todayIso}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none'
                  />
                </div>
                <div className='space-y-1'>
                  <label className='text-xs text-slate-400'>Hora</label>
                  <input
                    type='time'
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none'
                  />
                </div>
              </div>
            </div>
          )}

          {/* Origin */}
          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>Origem</label>
            <input
              type='text'
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
              placeholder='Ex: Prefeitura Municipal'
            />
          </div>

          {/* Destination */}
          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>Destino Médico</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
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

          {/* Driver — optional for scheduled routes */}
          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>
              Motorista{' '}
              {dispatchType === 'SCHEDULED' && (
                <span className='text-slate-500 normal-case'>(opcional para agendamento)</span>
              )}
            </label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
            >
              <option value=''>— Selecionar motorista —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user?.name}
                  {d.status && (
                    ` · ${getDriverStatusLabel(d.status)}`
                  )}
                </option>
              ))}
            </select>
            {driverId && (() => {
              const d = drivers.find((dr) => dr.id === driverId);
              if (!d) return null;
              const cls = DRIVER_STATUS_BADGE[d.status] ?? 'bg-slate-800 text-slate-400';
              return (
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
                  {getDriverStatusLabel(d.status)}
                </span>
              );
            })()}
          </div>

          {/* Vehicle — optional for scheduled routes */}
          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>
              Veículo{' '}
              {dispatchType === 'SCHEDULED' && (
                <span className='text-slate-500 normal-case'>(opcional para agendamento)</span>
              )}
            </label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
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
                ⚠ Pacientes selecionados ({selectedPatients.length}) excedem capacidade (
                {selectedVehicle?.capacity}).
              </p>
            )}
          </div>

          {/* Summary */}
          {selectedPatients.length > 0 && (
            <div className='rounded-lg border border-cyan-900/50 bg-cyan-950/20 p-3 text-xs text-cyan-300 space-y-1'>
              <p className='font-semibold'>Resumo</p>
              <p>Pacientes: {selectedPatients.length}</p>
              {dispatchType === 'SCHEDULED' && scheduledDate && (
                <p>
                  Agendado: {new Date(`${scheduledDate}T${scheduledTime}:00`).toLocaleString('pt-BR')}
                </p>
              )}
              {selectedVehicle && (
                <p>
                  Veículo: {selectedVehicle.plate} ({selectedVehicle.capacity} lugares)
                </p>
              )}
              {locationId && (
                <p>Destino: {locations.find((l) => l.id === locationId)?.name}</p>
              )}
              {!driverId && dispatchType === 'SCHEDULED' && (
                <p className='text-slate-400'>Motorista: a atribuir</p>
              )}
            </div>
          )}

          {/* Dispatch button */}
          <button
            type='button'
            disabled={!canDispatch || dispatch.isPending}
            onClick={() => dispatch.mutate()}
            className={`w-full rounded-lg px-4 py-3 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              dispatchType === 'SCHEDULED'
                ? 'bg-indigo-700 hover:bg-indigo-600'
                : 'bg-cyan-700 hover:bg-cyan-600'
            }`}
          >
            {dispatch.isPending
              ? 'Processando…'
              : dispatchType === 'SCHEDULED'
              ? `📅 Agendar Rota (${selectedPatients.length} paciente(s))`
              : `🚐 Despachar Rota (${selectedPatients.length} paciente(s))`}
          </button>

          {selectedPatients.length === 0 && (
            <p className='text-xs text-slate-500 text-center'>
              Selecione ao menos 1 paciente da fila
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

