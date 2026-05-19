'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const STATUS_BADGE: Record<string, string> = {
  PLANNING: 'bg-cyan-900 text-cyan-300',
  ACTIVE: 'bg-emerald-900 text-emerald-300',
  CLOSED: 'bg-slate-700 text-slate-400',
  CANCELLED: 'bg-red-900 text-red-300',
};

const SHIFT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Aguardando',
  ACTIVE: 'Ativo',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
};

export default function DailyOpPage() {
  const queryClient = useQueryClient();

  const { data: operation, isLoading } = useQuery({
    queryKey: ['daily-op-today'],
    queryFn: () => api.get('/daily-operations/today').then((r) => r.data),
    refetchInterval: 15000,
  });

  const activateOp = useMutation({
    mutationFn: (id: string) => api.put(`/daily-operations/${id}/status`, { status: 'ACTIVE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-op-today'] }),
  });

  const closeOp = useMutation({
    mutationFn: (id: string) => api.put(`/daily-operations/${id}/status`, { status: 'CLOSED' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-op-today'] }),
  });

  const updateShift = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/shifts/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['daily-op-today'] }),
  });

  if (isLoading) return <LoadingSpinner />;

  const shifts = operation?.shifts ?? [];

  return (
    <section className='space-y-6'>
      <div>
        <h2 className='text-2xl font-bold text-slate-100'>Operação do Dia</h2>
        <p className='text-sm text-slate-400'>Controle diário de turnos, veículos e equipe</p>
      </div>

      {/* Status banner */}
      <div className='rounded-xl border border-cyan-700 bg-cyan-950/40 p-4'>
        <div className='flex items-center justify-between gap-4 flex-wrap'>
          <div>
            <p className='text-xs uppercase tracking-wider text-cyan-400'>Operação Atual</p>
            <p className='text-lg font-bold text-slate-100'>
              {operation?.date
                ? new Date(operation.date).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
            {operation?.notes && <p className='text-xs text-slate-400 mt-1'>{operation.notes}</p>}
          </div>
          <div className='flex items-center gap-3'>
            <span className={`rounded-full px-4 py-1 text-sm font-medium ${STATUS_BADGE[operation?.status ?? 'PLANNING'] ?? 'text-slate-400'}`}>
              {operation?.status ?? 'PLANEJANDO'}
            </span>
            {operation?.status === 'PLANNING' && (
              <button type='button' onClick={() => operation?.id && activateOp.mutate(operation.id)}
                className='rounded-lg bg-emerald-700 px-4 py-1.5 text-sm font-semibold hover:bg-emerald-600 transition-colors'>
                ▶ Ativar Operação
              </button>
            )}
            {operation?.status === 'ACTIVE' && (
              <button type='button' onClick={() => operation?.id && closeOp.mutate(operation.id)}
                className='rounded-lg border border-slate-600 px-4 py-1.5 text-sm text-slate-400 hover:border-red-700 hover:text-red-400 transition-colors'>
                ■ Encerrar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Shifts */}
      <div>
        <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'>Turnos</h3>
        {shifts.length === 0 ? (
          <div className='p-4 border border-border rounded-xl bg-panel text-center space-y-3'>
            <p className='text-sm text-slate-400'>Nenhum turno criado para hoje.</p>
            <p className='text-xs text-slate-500'>O sistema cria os turnos automaticamente ao carregar a página. Tente recarregar.</p>
          </div>
        ) : (
          <div className='grid gap-3 md:grid-cols-3'>
            {shifts.map((shift: any) => (
              <div key={shift.id} className='rounded-xl border border-border bg-panel p-4 space-y-2'>
                <p className='font-semibold'>{shift.name}</p>
                <p className='text-sm text-slate-400'>{shift.startTime} – {shift.endTime}</p>
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[shift.status] ?? 'bg-slate-800 text-slate-400'}`}>
                  {SHIFT_STATUS_LABEL[shift.status] ?? shift.status}
                </span>
                {shift.status === 'PENDING' && (
                  <button type='button' onClick={() => updateShift.mutate({ id: shift.id, status: 'ACTIVE' })}
                    className='block w-full text-center rounded bg-emerald-900/50 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-800 transition-colors'>
                    Ativar Turno
                  </button>
                )}
                {shift.status === 'ACTIVE' && (
                  <button type='button' onClick={() => updateShift.mutate({ id: shift.id, status: 'COMPLETED' })}
                    className='block w-full text-center rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors'>
                    Concluir Turno
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className='rounded-xl border border-border bg-panel p-4'>
        <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'>Resumo Operacional (Tempo Real)</h3>
        <div className='grid gap-4 grid-cols-2 md:grid-cols-4 text-center'>
          {[
            { label: 'Veículos Ativos', value: operation?.totalVehicles ?? 0 },
            { label: 'Motoristas Ativos', value: operation?.totalDrivers ?? 0 },
            { label: 'Pacientes na Fila', value: operation?.totalPatients ?? 0 },
            { label: 'Rotas Ativas', value: operation?.totalRoutes ?? 0 },
          ].map((s) => (
            <div key={s.label}>
              <p className='text-2xl font-bold text-cyan-400'>{s.value}</p>
              <p className='text-xs text-slate-400'>{s.label}</p>
            </div>
          ))}
        </div>
        {operation?.createdAutomatically && (
          <p className='mt-3 text-xs text-slate-500 text-center'>✦ Operação inicializada automaticamente pelo sistema</p>
        )}
      </div>
    </section>
  );
}

