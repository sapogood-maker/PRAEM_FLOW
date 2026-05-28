'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { schedulingImportService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'bg-indigo-900 text-indigo-300',
  PENDING: 'bg-slate-800 text-slate-400',
  PLANNED: 'bg-slate-800 text-slate-300',
  PREPARING: 'bg-amber-900 text-amber-300',
  DISPATCHED: 'bg-cyan-900 text-cyan-300',
  ACTIVE: 'bg-emerald-900 text-emerald-300',
  COMPLETED: 'bg-emerald-950 text-emerald-500',
  CANCELLED: 'bg-red-900 text-red-300',
};

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: '📅 Agendado',
  PENDING: '⏳ Pendente',
  PLANNED: '🗒️ Planejado',
  PREPARING: '🔧 Em Preparação',
  DISPATCHED: '📡 Despachado',
  ACTIVE: '🚐 Em Andamento',
  COMPLETED: '✅ Finalizado',
  CANCELLED: '❌ Cancelado',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const qc = useQueryClient();
  const today = new Date();
  const [startDate, setStartDate] = useState(toIsoDate(today));
  const [endDate, setEndDate] = useState(toIsoDate(addDays(today, 6)));
  const [statusFilter, setStatusFilter] = useState('');
  const [importMode, setImportMode] = useState<'PREVIEW' | 'APPLY'>('PREVIEW');
  const [autoAssignVehicles, setAutoAssignVehicles] = useState(true);
  const [defaultOrigin, setDefaultOrigin] = useState('Central PRAEM OPS');
  const [defaultDispatchType, setDefaultDispatchType] = useState<'SCHEDULED' | 'IMMEDIATE'>('SCHEDULED');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['schedule-routes', startDate, endDate, statusFilter],
    queryFn: () =>
      api
        .get('/routes', {
          params: {
            startDate,
            endDate,
            ...(statusFilter && { status: statusFilter }),
            limit: 100,
          },
        })
        .then((r) => r.data),
  });

  const items: any[] = data?.items ?? data ?? [];

  // Group routes by date for calendar-like display
  const byDate = items.reduce<Record<string, any[]>>((acc, r) => {
    const d = (r.scheduledAt ?? r.date ?? '').split('T')[0];
    if (d) {
      acc[d] = acc[d] ?? [];
      acc[d].push(r);
    }
    return acc;
  }, {});

  const sortedDates = Object.keys(byDate).sort();

  // Generate days in range for empty-day display
  const rangeDays: string[] = [];
  if (startDate && endDate) {
    let cur = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (cur <= end) {
      rangeDays.push(toIsoDate(cur));
      cur = addDays(cur, 1);
    }
  }

  const allDays = Array.from(new Set([...rangeDays, ...sortedDates])).sort();

  function setPreset(days: number) {
    setStartDate(toIsoDate(today));
    setEndDate(toIsoDate(addDays(today, days - 1)));
  }

  const uploadImport = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error('Selecione um arquivo CSV/XLSX.');
      return schedulingImportService.upload(selectedFile, {
        mode: importMode,
        autoAssignVehicles,
        defaultDispatchType,
        defaultOrigin,
      });
    },
    onSuccess: (result) => {
      setImportResult(result);
      if (result?.mode === 'APPLY') {
        qc.invalidateQueries({ queryKey: ['schedule-routes'] });
        qc.invalidateQueries({ queryKey: ['queue'] });
        qc.invalidateQueries({ queryKey: ['routes'] });
        qc.invalidateQueries({ queryKey: ['patients'] });
      }
    },
  });

  return (
    <section className='space-y-6'>
      {/* Header */}
      <div>
        <h2 className='text-2xl font-bold text-slate-100'>Importar Operação</h2>
        <p className='text-sm text-slate-400'>
          Fluxo principal: importar planilha SUS, detectar pacientes/destinos, gerar rotas e despachar.
        </p>
      </div>

      {/* Filters */}
      <div className='flex flex-wrap items-end gap-3 rounded-xl border border-border bg-panel p-4'>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>De</label>
          <input
            type='date'
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          />
        </div>

        <div className='space-y-3 rounded-xl border border-indigo-900/50 bg-indigo-950/20 p-4'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <h3 className='text-base font-semibold text-indigo-200'>Entrada SUS bruta (CSV/XLSX)</h3>
              <p className='text-xs text-slate-400'>Aceita planilhas simples com colunas variáveis. Campos mínimos: paciente e destino.</p>
            </div>
            <span className='rounded bg-indigo-900/60 px-2 py-1 text-xs text-indigo-300'>1. Importar → 2. Detectar → 3. Gerar</span>
          </div>
          <div className='grid gap-3 md:grid-cols-2'>
            <label className='space-y-1'>
              <span className='text-xs uppercase tracking-wider text-slate-400'>Arquivo</span>
              <input
                type='file'
                accept='.csv,.xlsx,.xls'
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
              />
            </label>
            <label className='space-y-1'>
              <span className='text-xs uppercase tracking-wider text-slate-400'>Modo</span>
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'PREVIEW' | 'APPLY')}
                className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
              >
                <option value='PREVIEW'>Pré-visualização (sem gravação)</option>
                <option value='APPLY'>Aplicar importação</option>
              </select>
            </label>
            <label className='space-y-1'>
              <span className='text-xs uppercase tracking-wider text-slate-400'>Tipo de despacho padrão</span>
              <select
                value={defaultDispatchType}
                onChange={(e) => setDefaultDispatchType(e.target.value as 'SCHEDULED' | 'IMMEDIATE')}
                className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
              >
                <option value='SCHEDULED'>Agendado</option>
                <option value='IMMEDIATE'>Imediato</option>
              </select>
            </label>
            <label className='space-y-1'>
              <span className='text-xs uppercase tracking-wider text-slate-400'>Origem padrão</span>
              <input
                type='text'
                value={defaultOrigin}
                onChange={(e) => setDefaultOrigin(e.target.value)}
                className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
              />
            </label>
            <label className='flex items-center gap-2 text-sm text-slate-300'>
              <input
                type='checkbox'
                checked={autoAssignVehicles}
                onChange={(e) => setAutoAssignVehicles(e.target.checked)}
              />
              Atribuir veículos automaticamente
            </label>
            <div className='flex items-end'>
              <button
                type='button'
                onClick={() => uploadImport.mutate()}
                disabled={!selectedFile || uploadImport.isPending}
                className='w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50'
              >
                {uploadImport.isPending ? 'Processando importação…' : importMode === 'PREVIEW' ? 'Importar Operação (Pré-visualizar)' : 'Importar Operação Agora'}
              </button>
            </div>
          </div>
          {uploadImport.isError && (
            <p className='text-sm text-red-400'>{(uploadImport.error as any)?.response?.data?.message ?? (uploadImport.error as Error).message}</p>
          )}
          {importResult && (
            <div className='space-y-2 rounded-lg border border-border bg-panel p-3 text-xs'>
              <p className='text-slate-300'>
                <strong>Resultado:</strong> {importResult.mode} · {importResult.file?.name} · {importResult.file?.rowCount ?? 0} linha(s)
              </p>
              {importResult.summary && (
                <p className='text-slate-400'>
                  Pacientes criados/reutilizados: {importResult.summary.createdPatients}/{importResult.summary.reusedPatients} ·
                  Filas criadas/reutilizadas: {importResult.summary.createdQueues}/{importResult.summary.reusedQueues} ·
                  Rotas: {importResult.summary.createdRoutes} · Viagens: {importResult.summary.createdTrips}
                </p>
              )}
              {importResult.intelligence && (
                <p className='text-cyan-300'>
                  Inteligência recorrente (prévia): pacientes conhecidos {importResult.intelligence.knownPatients ?? 0} ·
                  destinos conhecidos {importResult.intelligence.knownDestinations ?? 0} ·
                  sugestões de agrupamento {importResult.intelligence.recurringRouteMatches ?? 0}
                </p>
              )}
              {Array.isArray(importResult.warnings) && importResult.warnings.length > 0 && (
                <ul className='space-y-1 text-amber-300'>
                  {importResult.warnings.slice(0, 8).map((w: string) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>Até</label>
          <input
            type='date'
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          />
        </div>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          >
            <option value=''>Todos</option>
            {Object.keys(STATUS_LABEL).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Presets */}
        <div className='flex gap-2 self-end'>
          {[
            { label: 'Hoje', days: 1 },
            { label: '7 dias', days: 7 },
            { label: '14 dias', days: 14 },
            { label: '30 dias', days: 30 },
          ].map(({ label, days }) => (
            <button
              key={days}
              type='button'
              onClick={() => setPreset(days)}
              className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-xs text-slate-400 hover:text-slate-100 transition-colors'
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type='button'
          onClick={() => refetch()}
          className='self-end rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 transition-colors'
        >
          Atualizar
        </button>
      </div>

      {/* Summary */}
      <div className='flex flex-wrap gap-3 text-xs'>
        <span className='rounded-lg border border-border bg-panel px-3 py-2 text-slate-300'>
          Total: <strong>{items.length}</strong> rota(s)
        </span>
        {Object.entries(
          items.reduce<Record<string, number>>((acc, r) => {
            acc[r.status] = (acc[r.status] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([status, count]) => (
          <span key={status} className={`rounded-lg px-3 py-2 font-medium ${STATUS_BADGE[status] ?? 'bg-slate-800 text-slate-400'}`}>
            {STATUS_LABEL[status] ?? status}: {count}
          </span>
        ))}
      </div>

      {/* Calendar-like list */}
      {isLoading ? (
        <div className='flex justify-center p-8'>
          <LoadingSpinner />
        </div>
      ) : (
        <div className='space-y-4'>
          {allDays.map((day) => {
            const dayRoutes = byDate[day] ?? [];
            const isToday = day === toIsoDate(today);
            const isPast = day < toIsoDate(today);
            const dateLabel = new Date(day + 'T12:00:00').toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            });

            return (
              <div
                key={day}
                className={`rounded-xl border bg-panel ${isToday ? 'border-cyan-700' : 'border-border'}`}
              >
                {/* Day header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 border-b border-border ${
                    isToday ? 'bg-cyan-950/30' : isPast ? 'bg-slate-900/40' : ''
                  }`}
                >
                  <div className='flex items-center gap-2'>
                    {isToday && (
                      <span className='rounded bg-cyan-700 px-2 py-0.5 text-xs font-bold text-white'>
                        HOJE
                      </span>
                    )}
                    <span className={`font-semibold capitalize ${isPast && !isToday ? 'text-slate-500' : 'text-slate-100'}`}>
                      {dateLabel}
                    </span>
                  </div>
                  <span className='rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400'>
                    {dayRoutes.length} rota(s)
                  </span>
                </div>

                {/* Routes for this day */}
                {dayRoutes.length === 0 ? (
                  <p className='px-4 py-3 text-xs text-slate-600'>Sem rotas programadas</p>
                ) : (
                  <ul className='divide-y divide-border'>
                    {dayRoutes.map((r: any) => {
                      const timeStr = r.scheduledAt
                        ? new Date(r.scheduledAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : null;
                      return (
                        <li key={r.id} className='flex items-start gap-4 px-4 py-3'>
                          {/* Time */}
                          <div className='w-12 shrink-0 text-right text-xs font-mono text-slate-400 pt-0.5'>
                            {timeStr ?? '—'}
                          </div>

                          {/* Info */}
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-2 flex-wrap'>
                              <span className='font-medium text-slate-100 truncate'>
                                {r.origin} → {r.destination}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                  STATUS_BADGE[r.status] ?? 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {STATUS_LABEL[r.status] ?? r.status}
                              </span>
                            </div>
                            <p className='mt-0.5 text-xs text-slate-400'>
                              Motorista: {r.driver?.user?.name ?? <em>a atribuir</em>}
                              {' · '}
                              Veículo: {r.vehicle?.plate ?? '—'}
                              {' · '}
                              {r.trips?.length ?? 0} paciente(s)
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}

          {allDays.length === 0 && (
            <div className='rounded-xl border border-border bg-panel p-8 text-center text-slate-500'>
              Nenhuma rota no período selecionado.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
