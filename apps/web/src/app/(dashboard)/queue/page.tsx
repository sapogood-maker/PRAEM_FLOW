'use client';

import Link from 'next/link';
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
  getQueueSlaStatusLabel,
  getQueueStatusLabel,
} from '@/lib/i18n';
import { buildOperationalSuggestions } from '@/lib/operational-assistant';
import type { QueueType } from '@/types';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { DispatchOperationModal } from '@/components/operations/DispatchOperationModal';

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
  CALLED: 'bg-slate-800 text-slate-300',
  CONFIRMED: 'bg-cyan-900 text-cyan-300',
  CHECKED_IN: 'bg-blue-900 text-blue-300',
  BOARDING: 'bg-amber-900 text-amber-300',
  IN_TRANSIT: 'bg-indigo-900 text-indigo-300',
  ARRIVED: 'bg-emerald-900 text-emerald-300',
  COMPLETED: 'bg-emerald-900 text-emerald-300',
  CANCELLED: 'bg-red-900 text-red-300',
  NO_SHOW: 'bg-rose-900 text-rose-300',
  ASSIGNED: 'bg-cyan-900 text-cyan-300',
  SCHEDULED: 'bg-blue-900 text-blue-300',
  CLOSED: 'bg-slate-700 text-slate-400',
};

const SLA_BADGE: Record<string, string> = {
  DELAYED: 'bg-amber-900 text-amber-300',
  CRITICAL: 'bg-red-900 text-red-300',
};

const LIVE_STATUS_FILTER = 'WAITING,CONFIRMED,BOARDING,IN_TRANSIT,CALLED,CHECKED_IN,ASSIGNED,SCHEDULED';
const TERMINAL_STATUS_FILTER = 'COMPLETED,CANCELLED,NO_SHOW,ARRIVED';
const FINALIZED_TODAY_TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'CLOSED']);

type LifecycleTab = 'active' | 'transit' | 'finalizedToday' | 'history';
type QueueTypeFilter = 'ALL' | QueueType;

type Filters = {
  queueType: QueueTypeFilter;
  city: string;
  hospital: string;
  time: 'ALL' | 'MORNING' | 'AFTERNOON' | 'EVENING';
  priority: string;
  recurring: 'ALL' | 'ONLY' | 'EXCLUDE';
  vehicle: string;
  search: string;
};

const DEFAULT_FILTERS: Filters = {
  queueType: 'ALL',
  city: '',
  hospital: '',
  time: 'ALL',
  priority: '',
  recurring: 'ALL',
  vehicle: '',
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

function getFinalizedAt(item: DispatchQueueItem) {
  return item.arrivedAt ?? item.cancelledAt ?? item.noShowAt ?? item.createdAt ?? null;
}

function isSameDay(value: string | null, reference = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function isTerminalStatus(status: string) {
  return ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'ARRIVED', 'CLOSED'].includes(String(status).toUpperCase());
}

function getLiveActionConfig(status: string) {
  switch (String(status).toUpperCase()) {
    case 'WAITING':
    case 'CALLED':
    case 'ASSIGNED':
    case 'SCHEDULED':
    case 'CHECKED_IN':
      return [
        { label: 'Confirmar', status: 'CONFIRMED', tone: 'cyan' },
        { label: 'Cancelar', status: 'CANCELLED', tone: 'red' },
      ];
    case 'CONFIRMED':
      return [
        { label: 'Embarcar', status: 'BOARDING', tone: 'amber' },
        { label: 'Cancelar', status: 'CANCELLED', tone: 'red' },
      ];
    case 'BOARDING':
      return [
        { label: 'Ir p/ trânsito', status: 'IN_TRANSIT', tone: 'indigo' },
        { label: 'Cancelar', status: 'CANCELLED', tone: 'red' },
      ];
    case 'IN_TRANSIT':
      return [
        { label: 'Concluir', status: 'COMPLETED', tone: 'emerald' },
        { label: 'Chegou', status: 'ARRIVED', tone: 'emerald' },
        { label: 'Cancelar', status: 'CANCELLED', tone: 'red' },
      ];
    case 'ARRIVED':
      return [
        { label: 'Concluir', status: 'COMPLETED', tone: 'emerald' },
      ];
    default:
      return [];
  }
}

function actionButtonClass(tone: string) {
  switch (tone) {
    case 'cyan':
      return 'bg-cyan-900/60 text-cyan-200 hover:bg-cyan-800';
    case 'amber':
      return 'bg-amber-900/60 text-amber-200 hover:bg-amber-800';
    case 'indigo':
      return 'bg-indigo-900/60 text-indigo-200 hover:bg-indigo-800';
    case 'emerald':
      return 'bg-emerald-900/60 text-emerald-200 hover:bg-emerald-800';
    case 'red':
      return 'bg-red-900/60 text-red-200 hover:bg-red-800';
    default:
      return 'bg-slate-800 text-slate-200 hover:bg-slate-700';
  }
}

export default function QueuePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const revision = useRealtimeStore((s) => s.revision);
  const connected = useRealtimeStore((s) => s.connected);
  const activityFeed = useRealtimeStore((s) => s.activityFeed);

  const [activeTab, setActiveTab] = useState<LifecycleTab>('active');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  const queueTypeParam = filters.queueType === 'ALL' ? undefined : filters.queueType;
  const queueQueryParams = useMemo(() => {
    const base: Record<string, string | number> = { limit: 400 };
    if (queueTypeParam) base.type = queueTypeParam;
    return base;
  }, [queueTypeParam]);

  const liveQueueParams = useMemo(() => ({ ...queueQueryParams, status: LIVE_STATUS_FILTER }), [queueQueryParams]);
  const terminalQueueParams = useMemo(() => ({ ...queueQueryParams, status: TERMINAL_STATUS_FILTER }), [queueQueryParams]);

  const liveQuery = useQueue(liveQueueParams);
  const terminalQuery = useQueue(terminalQueueParams);

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

  useEffect(() => {
    setSelected(new Set());
  }, [activeTab, filters.queueType]);

  const updatePriority = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: string }) => queueService.updatePriority(id, priority),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['queue'] }),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/queue/${id}/status`, { status }).then((r) => r.data),
    onSuccess: (_data, variables) => {
      const terminal = isTerminalStatus(variables.status);
      if (terminal) {
        setRemovingIds((prev) => new Set(prev).add(variables.id));
        window.setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['queue'] });
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(variables.id);
            return next;
          });
        }, 220);
      } else {
        qc.invalidateQueries({ queryKey: ['queue'] });
      }
    },
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
            queueIds: groupItems.map((item) => item.id),
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

  const liveItems = (liveQuery.data?.items ?? []) as DispatchQueueItem[];
  const terminalItems = (terminalQuery.data?.items ?? []) as DispatchQueueItem[];

  const cityOptions = useMemo(
    () => Array.from(new Set(liveItems.map((i) => i.healthcareLocation?.city).filter(Boolean) as string[])).sort(),
    [liveItems],
  );
  const hospitalOptions = useMemo(
    () => Array.from(new Set([...liveItems, ...terminalItems].map((i) => i.healthcareLocation?.name ?? i.destination).filter(Boolean) as string[])).sort(),
    [liveItems, terminalItems],
  );

  const filteredLive = useMemo(() => {
    return liveItems.filter((item) => {
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
      return matchesSearch && matchesCity && matchesHospital && matchesTime && matchesPriority && matchesRecurring && matchesVehicle;
    });
  }, [liveItems, queueAssignments, filters]);

  const activeRows = useMemo(
    () => filteredLive.filter((item) => item.status !== 'IN_TRANSIT'),
    [filteredLive],
  );
  const transitRows = useMemo(
    () => filteredLive.filter((item) => item.status === 'IN_TRANSIT'),
    [filteredLive],
  );
  const todayFinalizedRows = useMemo(() => {
    return terminalItems
      .filter((item) => FINALIZED_TODAY_TERMINAL.has(String(item.status).toUpperCase()))
      .filter((item) => isSameDay(getFinalizedAt(item)));
  }, [terminalItems]);
  const historyRows = useMemo(() => {
    return terminalItems
      .filter((item) => !FINALIZED_TODAY_TERMINAL.has(String(item.status).toUpperCase()) || !isSameDay(getFinalizedAt(item)))
      .sort((a, b) => {
        const aTime = new Date(getFinalizedAt(a) ?? a.createdAt ?? 0).getTime();
        const bTime = new Date(getFinalizedAt(b) ?? b.createdAt ?? 0).getTime();
        return bTime - aTime;
      });
  }, [terminalItems]);

  const currentRows = useMemo(() => {
    switch (activeTab) {
      case 'transit':
        return transitRows;
      case 'finalizedToday':
        return todayFinalizedRows;
      case 'history':
        return historyRows;
      case 'active':
      default:
        return activeRows;
    }
  }, [activeTab, activeRows, transitRows, todayFinalizedRows, historyRows]);

  const selectedItems = useMemo(() => currentRows.filter((item) => selected.has(item.id)), [currentRows, selected]);
  const { suggestions, assignments } = useMemo(() => buildOperationalSuggestions(liveItems, vehicles), [liveItems, vehicles]);

  const realtimeOverview = useMemo(() => {
    const activeQueue = liveItems.filter((q) => q.status !== 'IN_TRANSIT').length;
    const inTransit = liveItems.filter((q) => q.status === 'IN_TRANSIT').length;
    const completedToday = todayFinalizedRows.length;
    const delayed = liveItems.filter((q) => String(q.slaStatus ?? '').toUpperCase() === 'DELAYED').length;
    const critical = liveItems.filter((q) =>
      String(q.slaStatus ?? '').toUpperCase() === 'CRITICAL' || String(q.priority ?? '').toUpperCase() === 'CRITICAL',
    ).length;
    const offlineDrivers = driversOnline.filter((d) => ['OFFLINE', 'GPS_LOST', 'WS_ONLY'].includes(String(d.operationalStatus ?? '').toUpperCase())).length;
    return { activeQueue, inTransit, completedToday, delayed, critical, offlineDrivers };
  }, [liveItems, todayFinalizedRows.length, driversOnline]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(currentRows.map((q) => q.id)) : new Set());
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

  const allowBulkActions = activeTab === 'active';
  const allowRowOperationalControls = activeTab === 'active' || activeTab === 'transit';
  return (
    <section className='space-y-4'>
      <header className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Fila Operacional</h2>
          <p className='text-sm text-slate-400'>
            Centro de despacho em tempo real · {currentRows.length} na aba · {realtimeOverview.activeQueue} ativos
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          {allowBulkActions && (
            <>
              <button
                type='button'
                onClick={() => setShowSuggestions((v) => !v)}
                className='rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 transition-colors'
              >
                🤖 Organizar Automaticamente
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
                disabled={selectedItems.length === 0}
                onClick={() => setShowDispatchModal(true)}
                className='flex items-center gap-2 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-bold text-white shadow-lg hover:bg-cyan-500 disabled:opacity-40 transition-all active:scale-95'
              >
                ⚡ DESPACHAR OPERAÇÃO
                {selectedItems.length > 0 && (
                  <span className='rounded-full bg-white/20 px-2 py-0.5 text-xs'>
                    {selectedItems.length}
                  </span>
                )}
              </button>
            </>
          )}
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
          <p className='text-xs uppercase text-slate-500'>Fila ativa</p>
          <p className='text-sm font-semibold text-cyan-300'>{realtimeOverview.activeQueue}</p>
        </div>
        <div className='rounded-xl border border-border bg-panel px-4 py-3'>
          <p className='text-xs uppercase text-slate-500'>Em trânsito</p>
          <p className='text-sm font-semibold text-indigo-300'>{realtimeOverview.inTransit}</p>
        </div>
        <div className='rounded-xl border border-border bg-panel px-4 py-3'>
          <p className='text-xs uppercase text-slate-500'>Finalizados hoje</p>
          <p className='text-sm font-semibold text-emerald-300'>{realtimeOverview.completedToday}</p>
        </div>
        <div className='rounded-xl border border-border bg-panel px-4 py-3'>
          <p className='text-xs uppercase text-slate-500'>Alertas</p>
          <p className='text-sm font-semibold text-rose-300'>
            {realtimeOverview.critical} críticos · {realtimeOverview.delayed} atrasos
          </p>
        </div>
      </div>

      <div className='grid gap-2 rounded-xl border border-border bg-panel p-3 md:grid-cols-8'>
        <select value={filters.queueType} onChange={(e) => setFilters((f) => ({ ...f, queueType: e.target.value as QueueTypeFilter }))} className='rounded bg-slate-900 px-3 py-2 text-sm'>
          <option value='ALL'>Todas as filas</option>
          <option value='LOGISTICS'>Fila Logística</option>
          <option value='MEDICAL'>Fila Médica</option>
        </select>
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
      </div>

      <div className='grid gap-2 rounded-xl border border-border bg-panel p-1 md:grid-cols-4'>
        {[
          { id: 'active' as LifecycleTab, label: 'Fila Ativa', count: activeRows.length },
          { id: 'transit' as LifecycleTab, label: 'Em Trânsito', count: transitRows.length },
          { id: 'finalizedToday' as LifecycleTab, label: 'Finalizados Hoje', count: todayFinalizedRows.length },
          { id: 'history' as LifecycleTab, label: 'Histórico', count: historyRows.length },
        ].map((tab) => (
          <button
            key={tab.id}
            type='button'
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span className='flex items-center justify-between gap-3'>
              <span>{tab.label}</span>
              <span className='rounded-full bg-slate-900/70 px-2 py-0.5 text-xs text-slate-300'>{tab.count}</span>
            </span>
          </button>
        ))}
      </div>

      {suggestions.length > 0 && allowRowOperationalControls && showSuggestions && (
        <div className='rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-3'>
          <div className='mb-2 flex items-center justify-between'>
            <p className='text-xs uppercase tracking-wide text-indigo-300'>
              🤖 Assistente Operacional · {suggestions.length} sugestões
            </p>
            <button
              type='button'
              onClick={() => setShowSuggestions(false)}
              className='text-xs text-slate-500 hover:text-slate-300'
            >
              Fechar
            </button>
          </div>
          <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3'>
            {suggestions.slice(0, 6).map((suggestion) => (
              <div key={suggestion.id} className='rounded border border-indigo-900/60 bg-slate-900/40 px-3 py-2 text-xs flex items-start justify-between gap-2'>
                <div>
                  <p className='font-semibold text-slate-100'>{suggestion.title}</p>
                  <p className='text-slate-400'>{suggestion.description}</p>
                </div>
                <button
                  type='button'
                  onClick={() => {
                    applyQueueAssignments(assignments, 'assistant');
                    // Select the patients in this suggestion
                    setSelected((prev) => {
                      const next = new Set(prev);
                      for (const id of suggestion.queueIds) next.add(id);
                      return next;
                    });
                  }}
                  className='shrink-0 rounded bg-indigo-700 px-2 py-1 text-xs text-white hover:bg-indigo-600'
                >
                  Aplicar
                </button>
              </div>
            ))}
          </div>
          <div className='mt-2'>
            <button
              type='button'
              onClick={() => {
                applyQueueAssignments(assignments, 'assistant');
                const allIds = suggestions.flatMap((s) => s.queueIds);
                setSelected(new Set(allIds));
                setShowSuggestions(false);
              }}
              className='rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors'
            >
              ✅ Aplicar todas as sugestões e selecionar
            </button>
          </div>
        </div>
      )}

      {liveQuery.isLoading || terminalQuery.isLoading ? (
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
                    checked={allowBulkActions && currentRows.length > 0 && currentRows.every((q) => selected.has(q.id))}
                    onChange={(e) => toggleAll(e.target.checked)}
                    disabled={!allowBulkActions}
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
              {currentRows.length === 0 && (
                <tr>
                  <td colSpan={10} className='p-8 text-center text-slate-500'>Sem itens nesta visão.</td>
                </tr>
              )}
              {currentRows.map((item) => {
                const assignment = queueAssignments[item.id] ?? {};
                const routeBadge = assignment.routeId ? `Rota ${assignment.routeId.slice(0, 6)}` : '';
                const liveActions = getLiveActionConfig(item.status);
                const terminal = isTerminalStatus(item.status) || activeTab === 'history' || activeTab === 'finalizedToday';
                const slaStatus = String(item.slaStatus ?? '').toUpperCase();
                const removing = removingIds.has(item.id);
                return (
                  <tr
                    key={item.id}
                    className={`border-t border-border transition-all duration-200 ${
                      removing ? 'opacity-0 translate-x-2' : ''
                    } ${selected.has(item.id) ? 'bg-cyan-950/20' : 'hover:bg-slate-900/40'} ${terminal ? 'text-slate-300' : ''}`}
                  >
                    <td className='p-3'>
                      <input
                        type='checkbox'
                        className='accent-cyan-500'
                        checked={selected.has(item.id)}
                        onChange={() => toggleOne(item.id)}
                        disabled={terminal || !allowBulkActions}
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
                        disabled={terminal}
                      >
                        {['EMERGENCY', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'PENDING'].map((p) => (
                          <option key={p} value={p}>{getPriorityLabel(p)}</option>
                        ))}
                      </select>
                    </td>
                    <td className='p-3 space-y-1'>
                      <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] ?? 'bg-slate-800 text-slate-300'}`}>
                        {getQueueStatusLabel(item.status)}
                      </span>
                      {slaStatus === 'DELAYED' || slaStatus === 'CRITICAL' ? (
                        <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold ${SLA_BADGE[slaStatus]}`}>
                          {getQueueSlaStatusLabel(slaStatus)}
                        </span>
                      ) : null}
                    </td>
                    <td className='p-3'>
                      {allowRowOperationalControls ? (
                        <select
                          value={assignment.vehicleId ?? ''}
                          onChange={(e) => assignQueueVehicle(item.id, e.target.value)}
                          className='w-full rounded bg-slate-900 px-2 py-1 text-xs'
                          disabled={terminal}
                        >
                          <option value=''>—</option>
                          {vehicles.map((v) => (
                            <option key={v.id} value={v.id}>{v.plate} · {v.model}</option>
                          ))}
                        </select>
                      ) : (
                        <span className='text-xs text-slate-500'>—</span>
                      )}
                    </td>
                    <td className='p-3'>
                      {allowRowOperationalControls ? (
                        <select
                          value={assignment.driverId ?? ''}
                          onChange={(e) => assignQueueDriver(item.id, e.target.value)}
                          className='w-full rounded bg-slate-900 px-2 py-1 text-xs'
                          disabled={terminal}
                        >
                          <option value=''>—</option>
                          {drivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.user?.name ?? d.id}</option>
                          ))}
                        </select>
                      ) : (
                        <span className='text-xs text-slate-500'>—</span>
                      )}
                    </td>
                    <td className='p-3'>
                      <button
                        type='button'
                        onClick={() => updateConfirmation.mutate({ id: item.id, status: item.confirmationStatus === 'CONFIRMED' ? 'PENDING' : 'CONFIRMED' })}
                        className={`rounded px-2 py-1 text-xs font-medium ${terminal ? 'opacity-60' : ''} ${
                          item.confirmationStatus === 'CONFIRMED'
                            ? 'bg-emerald-900 text-emerald-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                        disabled={terminal}
                      >
                        {getConfirmationStatusLabel(item.confirmationStatus ?? 'PENDING')}
                      </button>
                    </td>
                    <td className='p-3'>
                      {terminal ? (
                        <div className='flex flex-wrap gap-1'>
                          <Link href={`/replay`} className='rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700'>
                            Replay
                          </Link>
                          <Link href={`/reports`} className='rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700'>
                            Relatórios
                          </Link>
                        </div>
                      ) : (
                        <div className='space-y-1'>
                          <div className='flex flex-wrap gap-1'>
                            {liveActions.map((action) => (
                              <button
                                key={action.status}
                                type='button'
                                onClick={() => updateStatus.mutate({ id: item.id, status: action.status })}
                                className={`rounded px-2 py-1 text-[11px] ${actionButtonClass(action.tone)}`}
                              >
                                {action.label}
                              </button>
                            ))}
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
                      )}
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

      {/* Inline Dispatch Modal */}
      <DispatchOperationModal
        open={showDispatchModal}
        onClose={() => setShowDispatchModal(false)}
        patients={selectedItems}
        onDispatched={(routeId) => {
          setSelected(new Set());
          router.push(`/operations/${routeId}`);
        }}
      />
    </section>
  );
}
