'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { routeService, vehicleService, driverService, patientService } from '@/services/operational.service';
import { api } from '@/services/api';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { exportCsv } from '@/lib/reports/exportCsv';
import { exportExcel } from '@/lib/reports/exportExcel';
import { printOperationalReport } from '@/lib/reports/exportPdf';
import type { OperationalKpis } from '@/types';

interface Props {
  date: string;
}

type ExportState = 'idle' | 'loading' | 'done' | 'error';

function ExportButton({
  label,
  icon,
  description,
  onClick,
  accent,
}: {
  label: string;
  icon: string;
  description: string;
  onClick: () => void;
  accent: 'emerald' | 'cyan' | 'indigo';
}) {
  const [state, setState] = useState<ExportState>('idle');

  const handleClick = async () => {
    setState('loading');
    try {
      await onClick();
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  const borderColor = {
    emerald: 'border-emerald-700/40 hover:border-emerald-600/60 hover:bg-emerald-900/20',
    cyan: 'border-cyan-700/40 hover:border-cyan-600/60 hover:bg-cyan-900/20',
    indigo: 'border-indigo-700/40 hover:border-indigo-600/60 hover:bg-indigo-900/20',
  }[accent];

  const iconColor = {
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    indigo: 'text-indigo-400',
  }[accent];

  return (
    <button
      type='button'
      onClick={handleClick}
      disabled={state === 'loading'}
      className={`rounded-2xl border bg-white/5 p-5 text-left transition-colors ${borderColor} disabled:opacity-50`}
    >
      <p className={`text-3xl mb-3 ${iconColor}`}>{icon}</p>
      <p className='font-semibold text-slate-100 text-sm'>{label}</p>
      <p className='mt-1 text-xs text-slate-500'>{description}</p>
      {state === 'loading' && <p className='mt-2 text-xs text-slate-400'>Gerando...</p>}
      {state === 'done' && <p className='mt-2 text-xs text-emerald-400'>✓ Exportado com sucesso</p>}
      {state === 'error' && <p className='mt-2 text-xs text-rose-400'>Erro ao exportar. Tente novamente.</p>}
    </button>
  );
}

export function ExportCenterTab({ date }: Props) {
  const { data: kpis } = useQuery<OperationalKpis>({
    queryKey: ['report-kpis'],
    queryFn: dashboardService.kpis,
    staleTime: 60_000,
  });

  const { data: routesData, isLoading: routesLoading } = useQuery({
    queryKey: ['report-routes-export', date],
    queryFn: () => routeService.list({ date, limit: 500 }),
    staleTime: 60_000,
  });

  const { data: vehiclesData, isLoading: vehiclesLoading } = useQuery({
    queryKey: ['report-vehicles-export'],
    queryFn: () => vehicleService.list({ limit: 200 }),
    staleTime: 60_000,
  });

  const { data: driversData, isLoading: driversLoading } = useQuery({
    queryKey: ['report-drivers-export'],
    queryFn: () => driverService.list({ limit: 200 }),
    staleTime: 60_000,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['report-queue-export', date],
    queryFn: () => api.get('/queue', { params: { date, limit: 1000 } }).then((r) => r.data),
    staleTime: 60_000,
  });

  const isLoading = routesLoading || vehiclesLoading || driversLoading || queueLoading;

  const routes = routesData?.items ?? [];
  const vehicles = vehiclesData?.items ?? [];
  const drivers = driversData?.items ?? [];
  const queueItems: any[] = queueData?.items ?? [];

  const exportRoutesCSV = () => {
    exportCsv(
      routes.map((r: any) => ({
        nome: r.name ?? r.id,
        status: r.status,
        tipo: r.dispatchType ?? '',
        motorista: r.driver?.name ?? '',
        veiculo: r.vehicle?.plate ?? '',
        viagens: r.trips?.length ?? r.tripCount ?? 0,
        destino: r.destination ?? r.healthcareLocation?.name ?? '',
        horario: r.scheduledAt
          ? new Date(r.scheduledAt).toLocaleString('pt-BR')
          : r.createdAt
          ? new Date(r.createdAt).toLocaleString('pt-BR')
          : '',
      })),
      [
        { key: 'nome', label: 'Nome da Rota' },
        { key: 'status', label: 'Status' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'motorista', label: 'Motorista' },
        { key: 'veiculo', label: 'Veículo' },
        { key: 'viagens', label: 'Viagens' },
        { key: 'destino', label: 'Destino' },
        { key: 'horario', label: 'Horário' },
      ],
      `praem-rotas-${date}.csv`,
    );
  };

  const exportPatientsCSV = () => {
    exportCsv(
      queueItems.map((q: any) => ({
        paciente: q.patient?.name ?? q.patientId ?? '',
        status: q.status ?? '',
        confirmacao: q.confirmationStatus ?? '',
        prioridade: q.priority ?? '',
        destino: q.healthcareLocation?.name ?? q.destination ?? '',
        consulta: q.appointmentDate ? new Date(q.appointmentDate).toLocaleString('pt-BR') : '',
      })),
      [
        { key: 'paciente', label: 'Paciente' },
        { key: 'status', label: 'Status' },
        { key: 'confirmacao', label: 'Confirmação' },
        { key: 'prioridade', label: 'Prioridade' },
        { key: 'destino', label: 'Destino' },
        { key: 'consulta', label: 'Consulta' },
      ],
      `praem-pacientes-${date}.csv`,
    );
  };

  const exportVehiclesCSV = () => {
    exportCsv(
      vehicles.map((v: any) => ({
        placa: v.plate,
        modelo: v.model ?? '',
        tipo: v.type ?? '',
        capacidade: v.capacity ?? '',
        status: v.status,
        cadeirante: v.wheelchair ? 'Sim' : 'Não',
        maca: v.stretcher ? 'Sim' : 'Não',
      })),
      [
        { key: 'placa', label: 'Placa' },
        { key: 'modelo', label: 'Modelo' },
        { key: 'tipo', label: 'Tipo' },
        { key: 'capacidade', label: 'Capacidade' },
        { key: 'status', label: 'Status' },
        { key: 'cadeirante', label: 'Cadeirante' },
        { key: 'maca', label: 'Maca' },
      ],
      `praem-frota-${date}.csv`,
    );
  };

  const exportFullExcel = () => {
    exportExcel(
      [
        {
          name: 'Rotas',
          columns: [
            { key: 'nome', label: 'Nome' },
            { key: 'status', label: 'Status' },
            { key: 'motorista', label: 'Motorista' },
            { key: 'veiculo', label: 'Veículo' },
            { key: 'viagens', label: 'Viagens' },
            { key: 'destino', label: 'Destino' },
          ],
          rows: routes.map((r: any) => ({
            nome: r.name ?? r.id,
            status: r.status,
            motorista: r.driver?.name ?? '',
            veiculo: r.vehicle?.plate ?? '',
            viagens: r.trips?.length ?? r.tripCount ?? 0,
            destino: r.destination ?? '',
          })),
        },
        {
          name: 'Pacientes',
          columns: [
            { key: 'paciente', label: 'Paciente' },
            { key: 'status', label: 'Status' },
            { key: 'prioridade', label: 'Prioridade' },
            { key: 'destino', label: 'Destino' },
            { key: 'consulta', label: 'Consulta' },
          ],
          rows: queueItems.map((q: any) => ({
            paciente: q.patient?.name ?? q.patientId ?? '',
            status: q.status ?? '',
            prioridade: q.priority ?? '',
            destino: q.healthcareLocation?.name ?? q.destination ?? '',
            consulta: q.appointmentDate ? new Date(q.appointmentDate).toLocaleString('pt-BR') : '',
          })),
        },
        {
          name: 'Frota',
          columns: [
            { key: 'placa', label: 'Placa' },
            { key: 'modelo', label: 'Modelo' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'status', label: 'Status' },
          ],
          rows: vehicles.map((v: any) => ({
            placa: v.plate,
            modelo: v.model ?? '',
            tipo: v.type ?? '',
            status: v.status,
          })),
        },
        {
          name: 'Motoristas',
          columns: [
            { key: 'nome', label: 'Nome' },
            { key: 'status', label: 'Status' },
          ],
          rows: drivers.map((d: any) => ({
            nome: d.name,
            status: d.active ? 'Ativo' : 'Inativo',
          })),
        },
      ],
      `praem-relatorio-operacional-${date}.xls`,
    );
  };

  const exportPDF = () => {
    const completedRoutes = routes.filter((r: any) => r.status === 'COMPLETED').length;
    const cancelledRoutes = routes.filter((r: any) => r.status === 'CANCELLED').length;
    const noShowCount = queueItems.filter((q) => q.status === 'NO_SHOW').length;
    const transportedCount = queueItems.filter((q) =>
      ['COMPLETED', 'ARRIVED', 'IN_TRANSIT', 'BOARDED'].includes(q.status),
    ).length;
    const confirmationRate = kpis?.confirmationRate ?? 0;

    printOperationalReport({
      title: 'Relatório Operacional',
      subtitle: 'Transporte de Pacientes — Saúde Municipal',
      date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      sections: [
        {
          title: 'Resumo Geral',
          rows: [
            { label: 'Total de pacientes na fila', value: queueItems.length },
            { label: 'Pacientes transportados', value: transportedCount },
            { label: 'Não compareceu (ausências)', value: noShowCount },
            { label: 'Taxa de confirmação', value: `${confirmationRate.toFixed(1)}%` },
            { label: 'KM estimados', value: `${kpis?.estimatedKmToday ?? 0} km` },
          ],
        },
        {
          title: 'Execução de Rotas',
          rows: [
            { label: 'Total de rotas', value: routes.length },
            { label: 'Rotas concluídas', value: completedRoutes },
            { label: 'Rotas canceladas', value: cancelledRoutes },
            { label: 'Motoristas ativos', value: drivers.filter((d: any) => d.active).length },
            { label: 'Veículos na frota', value: vehicles.length },
          ],
        },
        {
          title: 'Frota',
          rows: vehicles.slice(0, 10).map((v: any) => ({
            label: `${v.plate} — ${v.model ?? v.type}`,
            value: v.status,
          })),
        },
        {
          title: 'Motoristas Ativos',
          rows: drivers
            .filter((d: any) => d.active)
            .slice(0, 10)
            .map((d: any) => ({
              label: d.name,
              value: 'Ativo',
            })),
        },
      ],
    });
  };

  return (
    <div className='space-y-8'>
      <div>
        <p className='text-[11px] uppercase tracking-[0.3em] text-slate-500'>Central de Exportações · {date}</p>
        <h3 className='mt-1 text-xl font-semibold text-slate-100'>Exportar Dados Operacionais</h3>
        <p className='mt-1 text-sm text-slate-400'>
          Gere relatórios em CSV, Excel ou PDF para auditoria, prestação de contas e controle operacional.
        </p>
      </div>

      {isLoading && (
        <div className='flex items-center gap-3 text-sm text-slate-400'>
          <LoadingSpinner />
          <span>Carregando dados para exportação...</span>
        </div>
      )}

      <div>
        <p className='mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500'>Exportações Individuais (CSV)</p>
        <div className='grid gap-4 md:grid-cols-3'>
          <ExportButton
            label='Rotas do Dia — CSV'
            icon='🗺️'
            description={`${routes.length} rota(s) com motorista, veículo e status`}
            onClick={exportRoutesCSV}
            accent='cyan'
          />
          <ExportButton
            label='Pacientes / Fila — CSV'
            icon='🏥'
            description={`${queueItems.length} registro(s) com status e confirmação`}
            onClick={exportPatientsCSV}
            accent='emerald'
          />
          <ExportButton
            label='Frota — CSV'
            icon='🚐'
            description={`${vehicles.length} veículo(s) com placa e tipo`}
            onClick={exportVehiclesCSV}
            accent='indigo'
          />
        </div>
      </div>

      <div>
        <p className='mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500'>Exportação Completa</p>
        <div className='grid gap-4 md:grid-cols-2'>
          <ExportButton
            label='Relatório Completo — Excel (.xls)'
            icon='📊'
            description='Todas as abas: rotas, pacientes, frota e motoristas em um arquivo'
            onClick={exportFullExcel}
            accent='emerald'
          />
          <ExportButton
            label='Relatório Operacional — PDF (Imprimir)'
            icon='🖨️'
            description='Documento oficial com resumo, rotas, frota e motoristas — pronto para impressão'
            onClick={exportPDF}
            accent='indigo'
          />
        </div>
      </div>

      <div className='rounded-2xl border border-white/5 bg-white/[0.03] p-5'>
        <p className='text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3'>Dados disponíveis para {date}</p>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3 text-sm'>
          <div>
            <p className='text-2xl font-bold text-slate-100'>{routes.length}</p>
            <p className='text-xs text-slate-500'>Rotas</p>
          </div>
          <div>
            <p className='text-2xl font-bold text-slate-100'>{queueItems.length}</p>
            <p className='text-xs text-slate-500'>Pacientes na Fila</p>
          </div>
          <div>
            <p className='text-2xl font-bold text-slate-100'>{vehicles.length}</p>
            <p className='text-xs text-slate-500'>Veículos</p>
          </div>
          <div>
            <p className='text-2xl font-bold text-slate-100'>{drivers.filter((d: any) => d.active).length}</p>
            <p className='text-xs text-slate-500'>Motoristas Ativos</p>
          </div>
        </div>
      </div>
    </div>
  );
}
