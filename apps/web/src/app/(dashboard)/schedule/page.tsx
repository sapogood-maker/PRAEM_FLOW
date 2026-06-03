'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { schedulingImportService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: '📅 Agendado',
  PENDING: '⏳ Pendente',
  PLANNED: '🗒 Planejado',
  PREPARING: '🔧 Em Preparação',
  DISPATCHED: '📡 Despachado',
  ACTIVE: '🚐 Em Andamento',
  COMPLETED: '✅ Finalizado',
  CANCELLED: '❌ Cancelado',
};

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDate(date: Date) {
  return date.toISOString().split('T')[0];
}

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
  const [confirmDuplicateFile, setConfirmDuplicateFile] = useState(false);
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

  const byDate = useMemo(
    () =>
      items.reduce<Record<string, any[]>>((acc, route) => {
        const day = String(route.scheduledAt ?? route.date ?? '').split('T')[0];
        if (!day) return acc;
        acc[day] = acc[day] ?? [];
        acc[day].push(route);
        return acc;
      }, {}),
    [items],
  );

  const uploadImport = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error('Selecione um arquivo CSV/XLSX.');
      return schedulingImportService.upload(selectedFile, {
        mode: importMode,
        autoAssignVehicles,
        defaultDispatchType,
        defaultOrigin,
        confirmDuplicateFile,
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
      <div>
        <h2 className='text-2xl font-bold text-slate-100'>Importar demanda SUS</h2>
        <p className='text-sm text-slate-400'>
          A importação agora só ingere pacientes, hospitais, demandas e fila operacional. Rotas, viagens, QR e
          notificações ficam no despacho.
        </p>
      </div>

      <div className='rounded-xl border border-border bg-panel p-4'>
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
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
              <option value='PREVIEW'>Pré-visualização</option>
              <option value='APPLY'>Aplicar importação</option>
            </select>
          </label>
          <label className='space-y-1'>
            <span className='text-xs uppercase tracking-wider text-slate-400'>Tipo padrão</span>
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
            <input type='checkbox' checked={autoAssignVehicles} onChange={(e) => setAutoAssignVehicles(e.target.checked)} />
            Sugerir agrupamento por IA
          </label>
          <label className='flex items-center gap-2 text-sm text-slate-300'>
            <input
              type='checkbox'
              checked={confirmDuplicateFile}
              onChange={(e) => setConfirmDuplicateFile(e.target.checked)}
            />
            Confirmar reimportação de arquivo duplicado
          </label>
          <div className='flex items-end'>
            <button
              type='button'
              onClick={() => uploadImport.mutate()}
              disabled={!selectedFile || uploadImport.isPending}
              className='w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-50'
            >
              {uploadImport.isPending ? 'Processando…' : 'Importar'}
            </button>
          </div>
        </div>

        {uploadImport.isError && (
          <p className='mt-3 text-sm text-red-400'>
            {(uploadImport.error as any)?.response?.data?.message ?? (uploadImport.error as Error).message}
          </p>
        )}

        {importResult && (
          <div className='mt-4 space-y-2 rounded-lg border border-border bg-panel p-3 text-xs'>
            <p className='text-slate-300'>
              <strong>Resultado:</strong> {importResult.mode} · {importResult.file?.name} · {importResult.file?.rowCount ?? 0} linha(s)
            </p>
            {importResult.warning && <p className='text-amber-300'>⚠ {importResult.warning}</p>}
            {importResult.summary && (
              <div className='grid gap-2 text-slate-400 md:grid-cols-2 xl:grid-cols-3'>
                <span>Pacientes criados: {importResult.summary.patientsCreated ?? 0}</span>
                <span>Pacientes atualizados: {importResult.summary.patientsUpdated ?? 0}</span>
                <span>Hospitais criados: {importResult.summary.hospitalsCreated ?? 0}</span>
                <span>Hospitais atualizados: {importResult.summary.hospitalsUpdated ?? 0}</span>
                <span>Demandas criadas: {importResult.summary.demandsCreated ?? 0}</span>
                <span>Demandas atualizadas: {importResult.summary.demandsUpdated ?? 0}</span>
                <span>Filas criadas: {importResult.summary.queueRecordsCreated ?? 0}</span>
                <span>Filas atualizadas: {importResult.summary.queueRecordsUpdated ?? 0}</span>
                <span>Duplicados ignorados: {importResult.summary.duplicatesSkipped ?? 0}</span>
                <span>Erros: {importResult.summary.errors ?? 0}</span>
              </div>
            )}
            {importResult.intelligence && (
              <p className='text-cyan-300'>
                Sugestões de agrupamento: {importResult.intelligence.recurringRouteMatches ?? 0} · pacientes conhecidos{' '}
                {importResult.intelligence.knownPatients ?? 0} · destinos conhecidos {importResult.intelligence.knownDestinations ?? 0}
              </p>
            )}
            {importResult.suggestOperationalGrouping?.suggestions?.length > 0 && (
              <p className='text-slate-400'>
                IA pronta para despacho futuro: {importResult.suggestOperationalGrouping.suggestions.length} sugestão(ões).
              </p>
            )}
            {Array.isArray(importResult.warnings) && importResult.warnings.length > 0 && (
              <ul className='space-y-1 text-amber-300'>
                {importResult.warnings.slice(0, 8).map((warning: string) => (
                  <li key={warning}>⚠ {warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className='flex flex-wrap items-end gap-3 rounded-xl border border-border bg-panel p-4'>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>De</label>
          <input
            type='date'
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
          />
        </div>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>Até</label>
          <input
            type='date'
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
          />
        </div>
        <div className='space-y-1'>
          <label className='text-xs uppercase tracking-wider text-slate-400'>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
          >
            <option value=''>Todos</option>
            {Object.keys(STATUS_LABEL).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </div>
        <button
          type='button'
          onClick={() => refetch()}
          className='self-end rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600'
        >
          Atualizar
        </button>
      </div>

      {isLoading ? (
        <div className='flex justify-center p-8'>
          <LoadingSpinner />
        </div>
      ) : (
        <div className='space-y-4'>
          <div className='flex flex-wrap gap-3 text-xs'>
            <span className='rounded-lg border border-border bg-panel px-3 py-2 text-slate-300'>
              Total: <strong>{items.length}</strong> rota(s)
            </span>
            {Object.entries(
              items.reduce<Record<string, number>>((acc, route) => {
                acc[route.status] = (acc[route.status] ?? 0) + 1;
                return acc;
              }, {}),
            ).map(([status, count]) => (
              <span key={status} className='rounded-lg bg-slate-800 px-3 py-2 font-medium text-slate-300'>
                {STATUS_LABEL[status] ?? status}: {count}
              </span>
            ))}
          </div>

          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {items.map((route) => (
              <div key={route.id} className='rounded-xl border border-border bg-panel p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <h3 className='font-semibold text-slate-100'>{route.destination ?? 'Destino não informado'}</h3>
                    <p className='text-xs text-slate-400'>
                      {new Date(route.scheduledAt ?? route.date ?? new Date()).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className='rounded bg-slate-800 px-2 py-1 text-xs text-slate-300'>
                    {STATUS_LABEL[route.status] ?? route.status}
                  </span>
                </div>
                <div className='mt-3 text-xs text-slate-400'>
                  <p>Veículo: {route.vehicle?.plate ?? '—'}</p>
                  <p>Motorista: {route.driver?.user?.name ?? '—'}</p>
                  <p>Viagens: {route.trips?.length ?? 0}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
