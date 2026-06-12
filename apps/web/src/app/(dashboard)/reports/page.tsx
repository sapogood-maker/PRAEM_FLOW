'use client';

import { useState } from 'react';
import {
  BarChart2,
  Truck,
  UserCheck,
  Route,
  Users,
  Download,
} from 'lucide-react';
import { OperationalSummaryTab } from '@/components/reports/OperationalSummaryTab';
import { VehicleReportsTab } from '@/components/reports/VehicleReportsTab';
import { DriverReportsTab } from '@/components/reports/DriverReportsTab';
import { RouteReportsTab } from '@/components/reports/RouteReportsTab';
import { PatientReportsTab } from '@/components/reports/PatientReportsTab';
import { ExportCenterTab } from '@/components/reports/ExportCenterTab';

const TABS = [
  { id: 'geral', label: 'Geral', icon: BarChart2 },
  { id: 'veiculos', label: 'Veículos', icon: Truck },
  { id: 'motoristas', label: 'Motoristas', icon: UserCheck },
  { id: 'rotas', label: 'Rotas', icon: Route },
  { id: 'pacientes', label: 'Pacientes', icon: Users },
  { id: 'exportacoes', label: 'Exportações', icon: Download },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ReportsPage() {
  const today = new Date().toISOString().split('T')[0];
  const [activeTab, setActiveTab] = useState<TabId>('geral');
  const [date, setDate] = useState(today);

  return (
    <div className='space-y-6'>
      {/* Header */}
      <header className='space-y-1'>
        <p className='text-[11px] uppercase tracking-[0.35em] text-cyan-300/70'>
          PRAEM OPS · Central de Relatórios Operacionais
        </p>
        <div className='flex flex-wrap items-end justify-between gap-4'>
          <div>
            <h2 className='text-3xl font-semibold text-slate-50'>Relatórios</h2>
            <p className='mt-1 text-sm text-slate-400'>
              Desempenho operacional, frota, motoristas, pacientes e exportações.
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <label className='text-xs text-slate-500 font-medium'>Data</label>
            <input
              type='date'
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className='rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500'
            />
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <nav className='flex flex-wrap gap-1 rounded-2xl border border-white/5 bg-slate-950/60 p-1.5'>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type='button'
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div className='rounded-2xl border border-white/5 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl'>
        {activeTab === 'geral' && <OperationalSummaryTab date={date} />}
        {activeTab === 'veiculos' && <VehicleReportsTab date={date} />}
        {activeTab === 'motoristas' && <DriverReportsTab date={date} />}
        {activeTab === 'rotas' && <RouteReportsTab date={date} />}
        {activeTab === 'pacientes' && <PatientReportsTab date={date} />}
        {activeTab === 'exportacoes' && <ExportCenterTab date={date} />}
      </div>
    </div>
  );
}
