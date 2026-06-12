'use client';

import { useQuery } from '@tanstack/react-query';
import { patientService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { ReportStatCard } from './ReportStatCard';

interface Props {
  date: string;
}

export function PatientReportsTab({ date }: Props) {
  const { data: patientsData, isLoading: patientsLoading } = useQuery({
    queryKey: ['report-patients'],
    queryFn: () => patientService.list({ limit: 200 }),
    staleTime: 60_000,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['report-queue', date],
    queryFn: () =>
      import('@/services/api').then(({ api }) =>
        api.get('/queue', { params: { date, limit: 500 } }).then((r) => r.data),
      ),
    staleTime: 60_000,
  });

  const isLoading = patientsLoading || queueLoading;

  if (isLoading) return <LoadingSpinner />;

  const patients = patientsData?.items ?? [];
  const queueItems: any[] = queueData?.items ?? [];

  // Queue-derived stats
  const confirmed = queueItems.filter((q) => q.status === 'CONFIRMED' || q.confirmationStatus === 'CONFIRMED').length;
  const transported = queueItems.filter((q) => ['COMPLETED', 'ARRIVED', 'IN_TRANSIT', 'BOARDED'].includes(q.status)).length;
  const noShow = queueItems.filter((q) => q.status === 'NO_SHOW').length;
  const waiting = queueItems.filter((q) => ['WAITING', 'CALLED', 'SCHEDULED'].includes(q.status)).length;
  const cancelled = queueItems.filter((q) => q.status === 'CANCELLED').length;
  const total = queueItems.length;

  const confirmationRate = total > 0 ? ((confirmed / total) * 100).toFixed(1) : '0';
  const transportRate = total > 0 ? ((transported / total) * 100).toFixed(1) : '0';

  // Patient flags
  const specialNeedsPatients = patients.filter((p: any) => p.specialNeeds || p.mobility !== 'WALKING').length;
  const wheelchairPatients = patients.filter((p: any) => p.mobility === 'WHEELCHAIR').length;
  const stretcherPatients = patients.filter((p: any) => p.mobility === 'STRETCHER').length;

  // Priority breakdown
  const urgentItems = queueItems.filter((q) => q.priority === 'URGENT' || q.priority === 'CRITICAL').length;

  return (
    <div className='space-y-6'>
      <div>
        <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Pacientes · {date}</p>
        <h3 className='mt-1 text-xl font-semibold text-slate-100'>Relatório de Transporte de Pacientes</h3>
        <p className='mt-1 text-sm text-slate-400'>{total} paciente(s) na fila para a data</p>
      </div>

      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Execução do Transporte</p>
        <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
          <ReportStatCard label='Total na Fila' value={total} accent='slate' />
          <ReportStatCard label='Transportados' value={transported} accent='emerald' />
          <ReportStatCard label='Aguardando' value={waiting} accent='cyan' />
          <ReportStatCard label='Não Compareceu' value={noShow} accent='amber' />
        </div>
      </div>

      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Indicadores de Qualidade</p>
        <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
          <ReportStatCard
            label='Taxa de Confirmação'
            value={`${confirmationRate}%`}
            accent={Number(confirmationRate) >= 80 ? 'emerald' : 'amber'}
          />
          <ReportStatCard
            label='Taxa de Transporte'
            value={`${transportRate}%`}
            accent={Number(transportRate) >= 80 ? 'emerald' : 'amber'}
          />
          <ReportStatCard label='Cancelamentos' value={cancelled} accent='rose' />
          <ReportStatCard label='Urgentes/Críticos' value={urgentItems} accent={urgentItems > 0 ? 'rose' : 'slate'} />
        </div>
      </div>

      <div>
        <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Necessidades Especiais (Cadastro)</p>
        <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
          <ReportStatCard label='Total Cadastrados' value={patients.length} accent='slate' />
          <ReportStatCard label='Com Necessidades Esp.' value={specialNeedsPatients} accent='indigo' />
          <ReportStatCard label='Cadeirante' value={wheelchairPatients} accent='amber' />
          <ReportStatCard label='Maca' value={stretcherPatients} accent='rose' />
        </div>
      </div>

      {/* Queue breakdown table */}
      {queueItems.length > 0 && (
        <div>
          <p className='mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500'>Fila de Pacientes · {date}</p>
          <div className='overflow-x-auto rounded-xl border border-white/5'>
            <table className='w-full text-sm'>
              <thead className='bg-slate-900 text-[11px] text-slate-400 uppercase tracking-wider'>
                <tr>
                  <th className='p-3 text-left'>Paciente</th>
                  <th className='p-3 text-left'>Destino</th>
                  <th className='p-3 text-left'>Consulta</th>
                  <th className='p-3 text-left'>Status</th>
                  <th className='p-3 text-left'>Prioridade</th>
                  <th className='p-3 text-left'>Confirmação</th>
                </tr>
              </thead>
              <tbody>
                {queueItems.slice(0, 50).map((q: any) => (
                  <tr key={q.id} className='border-t border-white/5 hover:bg-white/[0.02]'>
                    <td className='p-3 font-medium text-slate-200'>
                      {q.patient?.name ?? q.patientId?.slice(0, 8) ?? '—'}
                    </td>
                    <td className='p-3 text-slate-400 text-xs max-w-[160px] truncate'>
                      {q.healthcareLocation?.name ?? q.destination ?? '—'}
                    </td>
                    <td className='p-3 text-slate-500 text-xs whitespace-nowrap'>
                      {q.appointmentDate
                        ? new Date(q.appointmentDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className='p-3'>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ['COMPLETED', 'ARRIVED'].includes(q.status)
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : q.status === 'NO_SHOW'
                          ? 'bg-amber-900/60 text-amber-300'
                          : q.status === 'CANCELLED'
                          ? 'bg-rose-900/60 text-rose-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {q.status}
                      </span>
                    </td>
                    <td className='p-3 text-xs text-slate-500'>{q.priority ?? '—'}</td>
                    <td className='p-3 text-xs text-slate-500'>{q.confirmationStatus ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {queueItems.length > 50 && (
              <p className='px-3 py-2 text-xs text-slate-600 text-center border-t border-white/5'>
                Exibindo 50 de {queueItems.length} registros. Use Exportar para ver todos.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
