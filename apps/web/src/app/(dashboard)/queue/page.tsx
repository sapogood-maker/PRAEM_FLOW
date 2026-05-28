'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useQueue } from '@/hooks/useQueue';
import { api } from '@/services/api';
import { queueService } from '@/services/queue.service';
import { driverService, routeService, vehicleService } from '@/services/operational.service';
import { useOperationalDispatchStore, type DispatchQueueItem } from '@/store/operationalDispatch.store';
import { useRealtimeStore } from '@/store/realtime.store';
import {
  getConfirmationStatusLabel,
  getPriorityLabel,
  getQueueStatusLabel,
} from '@/lib/i18n';
import { buildOperationalSuggestions } from '@/lib/operational-assistant';
import type { QueueType } from '@/types';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const PRIORITY_BADGE: Record<string, string> = {
  EMERGENCY: 'bg-red-600 text-white animate-pulse',
  CRITICAL: 'bg-red-900 text-red-300',
  HIGH: 'bg-orange-900 text-orange-300',
  NORMAL: 'bg-slate-700 text-slate-300',
  LOW: 'bg-slate-800 text-slate-500',
  PENDING: 'bg-slate-800 text-slate-400',
};

const STATUS_BADGE: Record<string, string> = {
  WAITING: 'bg-slate-800 text-slate-300',
  ASSIGNED: 'bg-cyan-900 text-cyan-300',
  BOARDING: 'bg-amber-900 text-amber-300',
  IN_TRANSIT: 'bg-indigo-900 text-indigo-300',
  COMPLETED: 'bg-emerald-900 text-emerald-300',
  CANCELLED: 'bg-red-900 text-red-300',
  NO_SHOW: 'bg-rose-900 text-rose-300',
  SCHEDULED: 'bg-blue-900 text-blue-300',
};

const CONFIRMATION_BADGE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-900 text-emerald-300',
  PENDING: 'bg-amber-900 text-amber-300',
  CANCELED: 'bg-red-900 text-red-300',
  UNREACHABLE: 'bg-slate-800 text-slate-400',
  WAITING_MANUAL_CONFIRMATION: 'bg-cyan-900 text-cyan-300',
};

type Filters = {
  city: string;
  hospital: string;
  time: 'ALL' | 'MORNING' | 'AFTERNOON' | 'EVENING';
  priority: string;
  recurring: 'ALL' | 'ONLY' | 'EXCLUDE';
  vehicle: string;
  status: string;
  search: string;
};

const DEFAULT_FILTERS: Filters = {
  city: '',
  hospital: '',
  time: 'ALL',
  priority: '',
  recurring: 'ALL',
  vehicle: '',
  status: '',
  search: '',
};

function getTimeWindow(value?: string | null) {
  if (!value) return 'ALL';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ALL';
  const hour = date.getHours();
  if (hour < 12) return 'MORNING';
  if (hour < 18) return 'AFTERNOON';
  return 'EVENING';
}

function isRecurring(item: DispatchQueueItem) {
  return !!item.recurrenceType || !!item.notes?.toUpperCase().includes('RECORR') || !!item.destination?.toUpperCase().includes('HEMODI');
}

function buildGroupKey(item: DispatchQueueItem) {
  const destination = item.healthcareLocation?.id ?? item.destination ?? 'sem-destino';
  const date = item.appointmentDate ? new Date(item.appointmentDate) : null;
  const slot = date && !Number.isNaN(date.getTime())
    ? `${date.toISOString().slice(0, 10)}-${String(date.getHours()).padStart(2, '0')}`
    : 'sem-horario';
  return `grp-${destination}-${slot}`;
}

export default function QueuePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const revision = useRealtimeStore((s) => s.revision);
  const connected = useRealtimeStore((s) => s.connected);
  const vehiclePositions = useRealtimeStore((s) => s.vehiclePositions);
  const activityFeed = useRealtimeStore((s) => s.activityFeed);

  const [activeTab, setActiveTab] = useState<QueueType>('LOGISTICS');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const {
    addToDispatch,
    queueAssignments,
    assignQueueVehicle,
    assignQueueDriver,
    setQueueGroup,
    setQueueRoute,
    clearQueueAssignment,
    applyQueueAssignments,
  } = useOperationalDispatchStore();

  const { data, isLoading } = useQueue({ type: activeTab, limit: 200 });
  const items = (data?.items ?? []) as DispatchQueueItem[];

  const { data: vehiclesData } = useQuery({
    queryKey: ['queue-vehicles'],
    queryFn: () => vehicleService.list({ limit: 200 }),
  });
  const vehicles = (vehiclesData?.items ?? vehiclesData ?? []) as Array<{ id: string; plate: string; model: string; type?: string; status?: string }>;

  const { data: driversData } = useQuery({
    queryKey: ['queue-drivers'],
    queryFn: () => driverService.list({ limit: 200 }),
  });
  const drivers = (driversData?.items ?? driversData ?? []) as Array<{ id: string; status?: string; user?: { name?: string } }>;

  const { data: driversOnlineData } = useQuery({
    queryKey: ['queue-drivers-online'],
    queryFn: () => driverService.online(),
    refetchInterval: 15000,
  });
  const driversOnline = (driversOnlineData?.items ?? driversOnlineData ?? []) as Array<{ id: string; operationalStatus?: string; user?: { name?: string } }>;

  const { data: routesData } = useQuery({
    queryKey: ['queue-routes-open'],
    queryFn: () => routeService.list({ limit: 100, status: 'SCHEDULED,PLANNED,PENDING,PREPARING,DISPATCHED,ACTIVE' }),
  });
  const openRoutes = (routesData?.items ?? routesData ?? []) as Array<{ id: string; destination?: string }>;

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['queue'] });
    qc.invalidateQueries({ queryKey: ['queue-drivers-online'] });
  }, [revision, qc]);

  const updatePriority = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: string }) => queueService.updatePriority(id, priority),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/queue/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
  });

  const updateConfirmation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => queueService.updateConfirmation(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
  });

  const createRoutes = useMutation({
    mutationFn: async (selectedItems: DispatchQueueItem[]) => {
      if (selectedItems.length === 0) return { routesCreated: 0, tripsCreated: 0 };
      const groups = new Map<string, DispatchQueueItem[]>();
      for (const item of selectedItems) {
        const key = queueAssignments[item.id]?.groupKey ?? buildGroupKey(item);
        const current = groups.get(key) ?? [];
        current.push(item);
        groups.set(key, current);
      }

      let routesCreated = 0;
      let tripsCreated = 0;
      for (const groupItems of groups.values()) {
        const routeHints = Array.from(
          new Set(groupItems.map((row) => queueAssignments[row.id]?.routeId).filter(Boolean)),
        ) as string[];
        let routeId = routeHints.length === 1 ? routeHints[0] : '';
        if (!routeId) {
          const first = groupItems[0];
          const destination = first.healthcareLocation?.name ?? first.destination ?? 'Destino não informado';
          const assignment = queueAssignments[first.id] ?? {};
          const route = await api.post('/routes', {
            origin: 'Prefeitura Municipal',
            destination,
            date: first.appointmentDate ?? new Date().toISOString(),
            dispatchType: 'IMMEDIATE',
            status: 'PLANNED',
            ...(assignment.driverId ? { driverId: assignment.driverId } : {}),
            ...(assignment.vehicleId ? { vehicleId: assignment.vehicleId } : {}),
          }).then((r) => r.data);
          routeId = route.id;
          routesCreated += 1;
        }

        for (const row of groupItems) {
          await api.post('/trips', { routeId, patientId: row.patientId });
          await api.put(`/queue/${row.id}/status`, { status: 'ASSIGNED' });
          setQueueRoute(row.id, routeId);
          tripsCreated += 1;
        }
      }
      return { routesCreated, tripsCreated };
    },
    onSuccess: ({ routesCreated, tripsCreated }) => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['routes'] });
      qc.invalidateQueries({ queryKey: ['trips'] });
      alert(`✅ Operação criada: ${routesCreated} rota(s), ${tripsCreated} embarque(s) planejado(s).`);
      setSelected(new Set());
    },
    onError: (error: any) => {
      alert(error?.response?.data?.message ?? 'Erro ao criar rotas da fila operacional.');
    },
  });

  const cityOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.healthcareLocation?.city).filter(Boolean) as string[])).sort(),
    [items],
  );
  const hospitalOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.healthcareLocation?.name ?? i.destination).filter(Boolean) as string[])).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const assignment = queueAssignments[item.id];
      const destinationLabel = item.healthcareLocation?.name ?? item.destination ?? '';
      const matchesSearch =
        !filters.search ||
        item.patient?.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        destinationLabel.toLowerCase().includes(filters.search.toLowerCase());
      const matchesCity = !filters.city || item.healthcareLocation?.city === filters.city;
      const matchesHospital = !filters.hospital || destinationLabel === filters.hospital;
      const matchesTime = filters.time === 'ALL' || getTimeWindow(item.appointmentDate) === filters.time;
      const matchesPriority = !filters.priority || item.priority === filters.priority;
      const recurring = isRecurring(item) || !!assignment?.recurringHint;
      const matchesRecurring =
        filters.recurring === 'ALL' ||
        (filters.recurring === 'ONLY' ? recurring : !recurring);
      const matchesVehicle = !filters.vehicle || assignment?.vehicleId === filters.vehicle;
      const matchesStatus = !filters.status || item.status === filters.status;
      return matchesSearch && matchesCity && matchesHospital && matchesTime && matchesPriority && matchesRecurring && matchesVehicle && matchesStatus;
    });
  }, [items, queueAssignments, filters]);

  const selectedItems = filtered.filter((item) => selected.has(item.id));
  const { suggestions, assignments } = useMemo(() => buildOperationalSuggestions(items, vehicles), [items, vehicles]);

  const realtimeOverview = useMemo(() => {
    const confirmed = items.filter((q) => q.confirmationStatus === 'CONFIRMED').length;
    const boarding = items.filter((q) => q.status === 'BOARDING').length;
    const delayed = items.filter((q: any) => q.delayMinutes > 0 || ['DELAYED', 'CRITICAL'].includes(String(q.slaStatus ?? '').toUpperCase())).length;
    const offlineDrivers = driversOnline.filter((d) => ['OFFLINE', 'GPS_LOST', 'WS_ONLY'].includes(String(d.operationalStatus ?? '').toUpperCase())).length;
    return { confirmed, boarding, delayed, offlineDrivers };
  }, [items, driversOnline]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((q) => q.id)) : new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function groupSelectedManually() {
    if (selectedItems.length === 0) return;
    const key = `manual-${Date.now()}`;
    for (const item of selectedItems) {
      setQueueGroup(item.id, key);
    }
  }

  function sendSelectedToDispatch() {
    for (const item of selectedItems) {
      addToDispatch(item);
    }
    router.push('/dispatch');
  }

  return (
    <section className='space-y-4'>
      <header className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Fila Operacional</h2>
          <p className='text-sm text-slate-400'>
            Centro de despacho em tempo real · {filtered.length} de {items.length} pacientes
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            type='button'
            onClick={() => applyQueueAssignments(assignments, 'assistant')}
            className='rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 transition-colors'
          >
            Organizar Automaticamente
          </button>
          <button
            type='button'
            onClick={groupSelectedManually}
            disabled={selectedItems.length === 0}
            className='rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40'
          >
            Agrupar pacientes
          </button>
          <button
            type='button'
            onClick={() => createRoutes.mutate(selectedItems)}
            disabled={selectedItems.length === 0 || createRoutes.isPending}
            className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-40'
          >
            Criar rota
          </button>
          <button
            type='button'
            onClick={sendSelectedToDispatch}
            disabled={selectedItems.length === 0}
            className='rounded-lg border border-cyan-700 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-950/40 disabled:opacity-40'
          >
            Abrir Central de Despacho
          </button>
        </div>
      </header>

      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
        <div className='rounded-xl border border-border bg-panel px-4 py-3'>
          <p className='text-xs uppercase text-slate-500'>Conexão realtime</p>
          <p className={`text-sm font-semibold ${connected ? 'text-emerald-300' : 'text-red-300'}`}>
            {connected ? 'Online' : 'Offline'}
          </p>
        </div>
        <div className='rounded-xl border border-border bg-panel px-4 py-3'>
          <p className='text-xs uppercase text-slate-500'>Confirmações</p>
          <p className='text-sm font-semibold text-cyan-300'>{realtimeOverview.confirmed} confirmados</p>
        </div>
        <div className='rounded-xl border border-border bg-panel px-4 py-3'>
          <p className='text-xs uppercase text-slate-500'>Embarque</p>
          <p className='text-sm font-semibold text-amber-300'>{realtimeOverview.boarding} em operação</p>
        </div>
        <div className='rounded-xl border border-border bg-panel px-4 py-3'>
          <p className='text-xs uppercase text-slate-500'>GPS ativo</p>
          <p className='text-sm font-semibold text-indigo-300'>{vehiclePositions.length} veículos</p>
        </div>
        <div className='rounded-xl border border-border bg-panel px-4 py-3'>
          <p className='text-xs uppercase text-slate-500'>Alertas</p>
          <p className='text-sm font-semibold text-rose-300'>
            {realtimeOverview.offlineDrivers} offline · {realtimeOverview.delayed} atrasos
          </p>
        </div>
      </div>

      <div className='grid gap-2 rounded-xl border border-border bg-panel p-3 md:grid-cols-8'>
        <input
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          placeholder='Paciente/destino'
          className='rounded bg-slate-900 px-3 py-2 text-sm'
        />
        <select value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} className='rounded bg-slate-900 px-3 py-2 text-sm'>
          <option value=''>Cidade</option>
          {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
        <select value={filters.hospital} onChange={(e) => setFilters((f) => ({ ...f, hospital: e.target.value }))} className='rounded bg-slate-900 px-3 py-2 text-sm'>
          <option value=''>Hospital</option>
          {hospitalOptions.map((hospital) => <option key={hospital} value={hospital}>{hospital}</option>)}
        </select>
        <select value={filters.time} onChange={(e) => setFilters((f) => ({ ...f, time: e.target.value as Filters['time'] }))} className='rounded bg-slate-900 px-3 py-2 text-sm'>
          <option value='ALL'>Horário</option>
          <option value='MORNING'>Manhã</option>
          <option value='AFTERNOON'>Tarde</option>
          <option value='EVENING'>Noite</option>
        </select>
        <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))} className='rounded bg-slate-900 px-3 py-2 text-sm'>
          <option value=''>Prioridade</option>
          {['EMERGENCY', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'PENDING'].map((p) => <option key={p} value={p}>{getPriorityLabel(p)}</option>)}
        </select>
        <select value={filters.recurring} onChange={(e) => setFilters((f) => ({ ...f, recurring: e.target.value as Filters['recurring'] }))} className='rounded bg-slate-900 px-3 py-2 text-sm'>
          <option value='ALL'>Recorrência</option>
          <option value='ONLY'>Somente recorrentes</option>
          <option value='EXCLUDE'>Sem recorrência</option>
        </select>
        <select value={filters.vehicle} onChange={(e) => setFilters((f) => ({ ...f, vehicle: e.target.value }))} className='rounded bg-slate-900 px-3 py-2 text-sm'>
          <option value=''>Veículo</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate} · {v.model}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className='rounded bg-slate-900 px-3 py-2 text-sm'>
          <option value=''>Status</option>
          {['WAITING', 'ASSIGNED', 'SCHEDULED', 'BOARDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => (
            <option key={s} value={s}>{getQueueStatusLabel(s)}</option>
          ))}
        </select>
      </div>

      {suggestions.length > 0 && (
        <div className='rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-3'>
          <p className='mb-2 text-xs uppercase tracking-wide text-indigo-300'>
            Assistente Operacional · sugestões ativas ({suggestions.length})
          </p>
          <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3'>
            {suggestions.slice(0, 6).map((suggestion) => (
              <div key={suggestion.id} className='rounded border border-indigo-900/60 bg-slate-900/40 px-3 py-2 text-xs'>
                <p className='font-semibold text-slate-100'>{suggestion.title}</p>
                <p className='text-slate-400'>{suggestion.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className='flex gap-1 rounded-lg border border-border bg-panel p-1 w-fit'>
        {[
          { value: 'LOGISTICS' as QueueType, label: 'Fila Logística' },
          { value: 'MEDICAL' as QueueType, label: 'Fila Médica' },
        ].map((tab) => (
          <button
            key={tab.value}
            type='button'
            onClick={() => setActiveTab(tab.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.value ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-xs uppercase tracking-wider text-slate-400'>
              <tr>
                <th className='p-3 w-10'>
                  <input
                    type='checkbox'
                    className='accent-cyan-500'
                    checked={filtered.length > 0 && filtered.every((q) => selected.has(q.id))}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className='p-3 text-left'>Paciente</th>
                <th className='p-3 text-left'>Destino</th>
                <th className='p-3 text-left'>Hora consulta</th>
                <th className='p-3 text-left'>Prioridade</th>
                <th className='p-3 text-left'>Status</th>
                <th className='p-3 text-left'>Veículo atribuído</th>
                <th className='p-3 text-left'>Motorista atribuído</th>
                <th className='p-3 text-left'>Confirmação</th>
                <th className='p-3 text-left'>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className='p-8 text-center text-slate-500'>Sem itens na fila para os filtros atuais.</td>
                </tr>
              )}
              {filtered.map((item) => {
                const assignment = queueAssignments[item.id] ?? {};
                const routeBadge = assignment.routeId ? `Rota ${assignment.routeId.slice(0, 6)}` : '';
                return (
                  <tr key={item.id} className={`border-t border-border ${selected.has(item.id) ? 'bg-cyan-950/20' : 'hover:bg-slate-900/40'}`}>
                    <td className='p-3'>
                      <input
                        type='checkbox'
                        className='accent-cyan-500'
                        checked={selected.has(item.id)}
                        onChange={() => toggleOne(item.id)}
                      />
                    </td>
                    <td className='p-3'>
                      <p className='font-medium text-slate-100'>{item.patient?.name ?? item.patientId}</p>
                      <p className='text-xs text-slate-500'>{item.patient?.mobility ?? 'NORMAL'}</p>
                      {(assignment.recurringHint || isRecurring(item)) && (
                        <span className='mt-1 inline-block rounded bg-violet-900/60 px-2 py-0.5 text-[10px] text-violet-200'>
                          Recorrente
                        </span>
                      )}
                    </td>
                    <td className='p-3 text-xs text-slate-300'>
                      <p className='font-medium text-slate-200'>{item.healthcareLocation?.name ?? item.destination ?? '—'}</p>
                      <p className='text-slate-500'>{item.healthcareLocation?.city ?? '—'}</p>
                    </td>
                    <td className='p-3 text-xs'>
                      {item.appointmentDate ? new Date(item.appointmentDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className='p-3'>
                      <select
                        value={item.priority}
                        onChange={(e) => updatePriority.mutate({ id: item.id, priority: e.target.value })}
                        className={`rounded px-2 py-1 text-xs font-medium ${PRIORITY_BADGE[item.priority] ?? 'bg-slate-700 text-slate-300'}`}
                      >
                        {['EMERGENCY', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'PENDING'].map((p) => (
                          <option key={p} value={p}>{getPriorityLabel(p)}</option>
                        ))}
                      </select>
                    </td>
                    <td className='p-3'>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] ?? 'bg-slate-800 text-slate-300'}`}>
                        {getQueueStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className='p-3'>
                      <select
                        value={assignment.vehicleId ?? ''}
                        onChange={(e) => assignQueueVehicle(item.id, e.target.value)}
                        className='w-full rounded bg-slate-900 px-2 py-1 text-xs'
                      >
                        <option value=''>—</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>{v.plate} · {v.model}</option>
                        ))}
                      </select>
                      {assignment.recommendedVehicleType && (
                        <p className='mt-1 text-[10px] text-cyan-300'>Sugestão: {assignment.recommendedVehicleType}</p>
                      )}
                    </td>
                    <td className='p-3'>
                      <select
                        value={assignment.driverId ?? ''}
                        onChange={(e) => assignQueueDriver(item.id, e.target.value)}
                        className='w-full rounded bg-slate-900 px-2 py-1 text-xs'
                      >
                        <option value=''>—</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>{d.user?.name ?? d.id}</option>
                        ))}
                      </select>
                    </td>
                    <td className='p-3'>
                      <button
                        type='button'
                        onClick={() => updateConfirmation.mutate({ id: item.id, status: item.confirmationStatus === 'CONFIRMED' ? 'PENDING' : 'CONFIRMED' })}
                        className={`rounded px-2 py-1 text-xs font-medium ${CONFIRMATION_BADGE[item.confirmationStatus ?? 'PENDING'] ?? 'bg-slate-800 text-slate-300'}`}
                      >
                        {getConfirmationStatusLabel(item.confirmationStatus ?? 'PENDING')}
                      </button>
                    </td>
                    <td className='p-3'>
                      <div className='space-y-1'>
                        <div className='flex flex-wrap gap-1'>
                          <button type='button' onClick={() => updateStatus.mutate({ id: item.id, status: 'BOARDING' })} className='rounded bg-amber-900/60 px-2 py-1 text-[11px] text-amber-200'>Embarque</button>
                          <button type='button' onClick={() => updateStatus.mutate({ id: item.id, status: 'CANCELLED' })} className='rounded bg-red-900/60 px-2 py-1 text-[11px] text-red-200'>Cancelar</button>
                          <button type='button' onClick={() => updateStatus.mutate({ id: item.id, status: 'COMPLETED' })} className='rounded bg-emerald-900/60 px-2 py-1 text-[11px] text-emerald-200'>Concluir</button>
                        </div>
                        <div className='flex gap-1'>
                          <select
                            value={assignment.routeId ?? ''}
                            onChange={(e) => setQueueRoute(item.id, e.target.value)}
                            className='rounded bg-slate-900 px-2 py-1 text-[11px]'
                          >
                            <option value=''>Reatribuir rota</option>
                            {openRoutes.map((route) => (
                              <option key={route.id} value={route.id}>
                                {route.id.slice(0, 8)} · {route.destination ?? 'Rota'}
                              </option>
                            ))}
                          </select>
                          <button
                            type='button'
                            onClick={() => clearQueueAssignment(item.id)}
                            className='rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400'
                          >
                            Limpar
                          </button>
                        </div>
                        {routeBadge && <p className='text-[10px] text-cyan-300'>{routeBadge}</p>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className='rounded-xl border border-border bg-panel p-3'>
        <p className='mb-2 text-xs uppercase text-slate-500'>Feed operacional ao vivo</p>
        <div className='space-y-1 text-xs text-slate-300'>
          {activityFeed.slice(0, 6).map((event) => (
            <p key={event.id}>
              <span className='text-slate-500'>{new Date(event.timestamp).toLocaleTimeString('pt-BR')}</span> · {event.message}
            </p>
          ))}
          {activityFeed.length === 0 && <p className='text-slate-500'>Aguardando eventos em tempo real...</p>}
        </div>
      </div>
    </section>
  );
}
