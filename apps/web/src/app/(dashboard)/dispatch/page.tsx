'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function DispatchPage() {
  const qc = useQueryClient();
  const [selectedPatients, setSelectedPatients] = useState<string[]>([]);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [origin, setOrigin] = useState('Prefeitura Municipal');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['dispatch-queue'],
    queryFn: () =>
      api
        .get('/queues', { params: { status: 'WAITING,CALLED,CONFIRMED', limit: 100 } })
        .then((r) => r.data),
    refetchInterval: 15_000,
  });

  const { data: driversData } = useQuery({
    queryKey: ['dispatch-drivers'],
    queryFn: () => api.get('/drivers', { params: { limit: 50 } }).then((r) => r.data),
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['dispatch-vehicles'],
    queryFn: () => api.get('/vehicles', { params: { limit: 50 } }).then((r) => r.data),
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

  // ── Dispatch mutation ──────────────────────────────────────────────────────

  const dispatch = useMutation({
    mutationFn: async () => {
      const loc = locations.find((l) => l.id === locationId);
      const destinationName = loc?.name ?? 'Destino não informado';

      // 1. Create route
      const routeRes = await api.post('/routes', {
        driverId,
        vehicleId,
        date: new Date().toISOString(),
        origin,
        destination: destinationName,
        status: 'PLANNED',
      });
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
      setSuccessMsg(
        `✅ Rota criada (${routeId.slice(0, 8)}…) com ${patientCount} paciente(s). Motorista notificado via Flutter.`,
      );
      setErrorMsg('');
      setSelectedPatients([]);
      setDriverId('');
      setVehicleId('');
      setLocationId('');
      qc.invalidateQueries({ queryKey: ['dispatch-queue'] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['routes'] });
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.message ?? 'Erro ao despachar rota.');
    },
  });

  const canDispatch =
    selectedPatients.length > 0 && !!driverId && !!vehicleId && !!locationId && !overCapacity;

  function togglePatient(queueId: string) {
    setSelectedPatients((prev) =>
      prev.includes(queueId) ? prev.filter((id) => id !== queueId) : [...prev, queueId],
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className='space-y-6'>
      {/* Header */}
      <div>
        <h2 className='text-2xl font-bold text-slate-100'>Central de Despacho</h2>
        <p className='text-sm text-slate-400'>
          Selecione pacientes da fila, motorista, veículo e destino para criar uma rota operacional real
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

      <div className='grid gap-6 xl:grid-cols-[1fr_360px]'>
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
              Nenhum paciente confirmado aguardando despacho.
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
                          {q.priority}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            q.status === 'CONFIRMED'
                              ? 'bg-emerald-900 text-emerald-300'
                              : q.status === 'CALLED'
                                ? 'bg-amber-900 text-amber-300'
                                : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {q.status === 'CONFIRMED' ? '✓ Confirmado' : q.status === 'CALLED' ? 'Chamado' : 'Aguardando'}
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

          {/* Driver */}
          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>Motorista</label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
            >
              <option value=''>— Selecionar motorista —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user?.name} · {d.status}
                </option>
              ))}
            </select>
          </div>

          {/* Vehicle */}
          <div className='space-y-1'>
            <label className='text-xs uppercase tracking-wider text-slate-400'>Veículo</label>
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
              <p className='font-semibold'>Resumo do Despacho</p>
              <p>Pacientes: {selectedPatients.length}</p>
              {selectedVehicle && (
                <p>
                  Veículo: {selectedVehicle.plate} ({selectedVehicle.capacity} lugares)
                </p>
              )}
              {locationId && (
                <p>Destino: {locations.find((l) => l.id === locationId)?.name}</p>
              )}
            </div>
          )}

          {/* Dispatch button */}
          <button
            type='button'
            disabled={!canDispatch || dispatch.isPending}
            onClick={() => dispatch.mutate()}
            className='w-full rounded-lg bg-cyan-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40'
          >
            {dispatch.isPending
              ? 'Despachando…'
              : `🚐 Despachar Rota (${selectedPatients.length} paciente(s))`}
          </button>
        </div>
      </div>
    </section>
  );
}
