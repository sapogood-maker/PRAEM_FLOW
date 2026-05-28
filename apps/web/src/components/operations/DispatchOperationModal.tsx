'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { routeService } from '@/services/operational.service';
import type { DispatchQueueItem } from '@/store/operationalDispatch.store';
import { getPriorityLabel } from '@/lib/i18n';

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
  type?: string;
  wheelchair?: boolean;
  stretcher?: boolean;
}

interface HealthcareLocation {
  id: string;
  name: string;
  city: string;
  type: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  patients: DispatchQueueItem[];
  onDispatched: (routeId: string) => void;
}

const DRIVER_STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'text-emerald-400',
  ON_ROUTE: 'text-amber-400',
  REST: 'text-blue-400',
  OFFLINE: 'text-slate-500',
};

const VEHICLE_STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'text-emerald-400',
  ON_ROUTE: 'text-amber-400',
  BOARDING: 'text-amber-400',
  MAINTENANCE: 'text-red-400',
  INACTIVE: 'text-slate-500',
  OFFLINE: 'text-slate-500',
};

// ─── DispatchOperationModal ───────────────────────────────────────────────────

export function DispatchOperationModal({ open, onClose, patients, onDispatched }: Props) {
  const qc = useQueryClient();

  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [origin, setOrigin] = useState('Prefeitura Municipal');
  const [dispatchType, setDispatchType] = useState<'IMMEDIATE' | 'SCHEDULED'>('IMMEDIATE');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setDriverId('');
      setVehicleId('');
      setDispatchType('IMMEDIATE');
      // Pre-fill destination from patients
      const firstLoc = patients.find((p) => p.healthcareLocation?.id)?.healthcareLocation;
      setLocationId(firstLoc?.id ?? '');
    }
  }, [open, patients]);

  const { data: driversData } = useQuery({
    queryKey: ['dispatch-modal-drivers'],
    queryFn: () => api.get('/drivers', { params: { limit: 100 } }).then((r) => r.data),
    enabled: open,
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['dispatch-modal-vehicles'],
    queryFn: () => api.get('/vehicles', { params: { limit: 100 } }).then((r) => r.data),
    enabled: open,
  });

  const { data: locationsData } = useQuery({
    queryKey: ['dispatch-modal-locations'],
    queryFn: () => api.get('/healthcare-locations', { params: { limit: 100 } }).then((r) => r.data),
    enabled: open,
  });

  const drivers: Driver[] = driversData?.items ?? driversData ?? [];
  const vehicles: Vehicle[] = vehiclesData?.items ?? vehiclesData ?? [];
  const locations: HealthcareLocation[] = locationsData?.items ?? locationsData ?? [];

  const availableDrivers = drivers.filter((d) => d.status === 'AVAILABLE');
  const availableVehicles = vehicles.filter((v) => v.status === 'AVAILABLE');

  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const overCapacity = selectedVehicle ? patients.length > selectedVehicle.capacity : false;

  // Auto-select driver's default vehicle
  useEffect(() => {
    if (driverId && !vehicleId) {
      const driver = drivers.find((d) => d.id === driverId);
      if (driver?.defaultVehicleId) setVehicleId(driver.defaultVehicleId);
    }
  }, [driverId, vehicleId, drivers]);

  const scheduledAt =
    dispatchType === 'SCHEDULED' && scheduledDate
      ? new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString()
      : undefined;

  const canDispatch =
    patients.length > 0 &&
    !!locationId &&
    !overCapacity &&
    (dispatchType === 'IMMEDIATE' || !!scheduledDate);

  const dispatch = useMutation({
    mutationFn: () => {
      const queueIds = patients.map((p) => p.id);
      return routeService.dispatchOperation({
        queueIds,
        locationId,
        origin,
        dispatchType,
        scheduledAt,
        date: scheduledAt ?? new Date().toISOString(),
        ...(driverId ? { driverId } : {}),
        ...(vehicleId ? { vehicleId } : {}),
        sendPatientNotifications: true,
        sendBoardingQr: true,
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['dispatch-queue'] });
      onDispatched(data.routeId as string);
      onClose();
    },
  });

  if (!open) return null;

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className='w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl'>
        {/* Header */}
        <div className='flex items-center justify-between border-b border-slate-800 px-6 py-4'>
          <div>
            <h2 className='text-lg font-bold text-slate-100'>⚡ Despachar Operação</h2>
            <p className='text-xs text-slate-400'>
              {patients.length} paciente{patients.length !== 1 ? 's' : ''} selecionado{patients.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors'
          >
            ✕
          </button>
        </div>

        <div className='p-6 space-y-5'>
          {/* Patient summary */}
          <div className='space-y-1.5 max-h-32 overflow-y-auto'>
            {patients.slice(0, 8).map((p) => (
              <div key={p.id} className='flex items-center gap-2 text-sm text-slate-300'>
                <span className='text-base'>{p.patient?.mobility === 'WHEELCHAIR' ? '♿' : p.patient?.mobility === 'STRETCHER' ? '🛏' : '🚶'}</span>
                <span className='font-medium truncate'>{p.patient?.name ?? p.patientId}</span>
                <span className='text-xs text-slate-500 shrink-0'>{getPriorityLabel(p.priority)}</span>
              </div>
            ))}
            {patients.length > 8 && (
              <div className='text-xs text-slate-500'>+ {patients.length - 8} mais…</div>
            )}
          </div>

          {/* Destination */}
          <div>
            <label className='mb-1.5 block text-xs font-medium text-slate-400'>
              🏥 Destino médico <span className='text-red-400'>*</span>
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className='w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none'
            >
              <option value=''>Selecione o destino…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} — {l.city}</option>
              ))}
            </select>
          </div>

          {/* Origin */}
          <div>
            <label className='mb-1.5 block text-xs font-medium text-slate-400'>📍 Origem</label>
            <input
              type='text'
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className='w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none'
            />
          </div>

          {/* Driver */}
          <div>
            <label className='mb-1.5 block text-xs font-medium text-slate-400'>🧑‍✈️ Motorista</label>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className='w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none'
            >
              <option value=''>Selecionar motorista…</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>{d.user?.name}</option>
              ))}
              {drivers.filter((d) => d.status !== 'AVAILABLE').map((d) => (
                <option key={d.id} value={d.id} className='text-slate-500'>
                  {d.user?.name} — {d.status}
                </option>
              ))}
            </select>
            {driverId && (
              <p className={`mt-1 text-xs ${DRIVER_STATUS_BADGE[drivers.find((d) => d.id === driverId)?.status ?? ''] ?? 'text-slate-400'}`}>
                Status: {drivers.find((d) => d.id === driverId)?.status ?? '—'}
              </p>
            )}
          </div>

          {/* Vehicle */}
          <div>
            <label className='mb-1.5 block text-xs font-medium text-slate-400'>🚐 Veículo</label>
            <select
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className={`w-full rounded-lg border ${overCapacity ? 'border-red-600' : 'border-slate-700'} bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none`}
            >
              <option value=''>Selecionar veículo…</option>
              {availableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.model} ({v.capacity} lugares)
                  {v.wheelchair ? ' ♿' : ''}{v.stretcher ? ' 🛏' : ''}
                </option>
              ))}
              {vehicles.filter((v) => v.status !== 'AVAILABLE').map((v) => (
                <option key={v.id} value={v.id} className='text-slate-500'>
                  {v.plate} · {v.model} — {v.status}
                </option>
              ))}
            </select>
            {overCapacity && (
              <p className='mt-1 text-xs text-red-400'>
                ⚠️ Capacidade excedida: {patients.length} pacientes / {selectedVehicle?.capacity ?? 0} lugares
              </p>
            )}
          </div>

          {/* Dispatch type */}
          <div>
            <label className='mb-1.5 block text-xs font-medium text-slate-400'>⏱ Tipo de despacho</label>
            <div className='flex gap-3'>
              {(['IMMEDIATE', 'SCHEDULED'] as const).map((type) => (
                <button
                  key={type}
                  type='button'
                  onClick={() => setDispatchType(type)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                    dispatchType === type
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {type === 'IMMEDIATE' ? '⚡ Imediato' : '📅 Agendado'}
                </button>
              ))}
            </div>
          </div>

          {/* Scheduled datetime */}
          {dispatchType === 'SCHEDULED' && (
            <div className='flex gap-3'>
              <div className='flex-1'>
                <label className='mb-1.5 block text-xs font-medium text-slate-400'>Data</label>
                <input
                  type='date'
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className='w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none'
                />
              </div>
              <div className='w-32'>
                <label className='mb-1.5 block text-xs font-medium text-slate-400'>Hora</label>
                <input
                  type='time'
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className='w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none'
                />
              </div>
            </div>
          )}

          {/* Error */}
          {dispatch.isError && (
            <div className='rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300'>
              {(dispatch.error as any)?.response?.data?.message ?? 'Erro ao despachar operação.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='flex items-center justify-between border-t border-slate-800 px-6 py-4'>
          <button
            type='button'
            onClick={onClose}
            className='rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors'
          >
            Cancelar
          </button>
          <button
            type='button'
            disabled={!canDispatch || dispatch.isPending}
            onClick={() => dispatch.mutate()}
            className='flex items-center gap-2 rounded-xl bg-cyan-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:bg-cyan-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'
          >
            {dispatch.isPending ? (
              <>⏳ Despachando…</>
            ) : (
              <>⚡ DESPACHAR OPERAÇÃO</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
