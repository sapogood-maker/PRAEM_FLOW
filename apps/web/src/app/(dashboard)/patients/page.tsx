'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { patientService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const RISK_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-900 text-red-300',
  HIGH: 'bg-orange-900 text-orange-300',
  MEDIUM: 'bg-amber-900 text-amber-300',
  LOW: 'bg-slate-800 text-slate-400',
};

const MOBILITY_LABEL: Record<string, string> = {
  NORMAL: 'Normal',
  WHEELCHAIR: '♿ Cadeirante',
  STRETCHER: '🛏 Maca',
  OXYGEN: '💨 Oxigênio',
};

type PatientForm = {
  name: string;
  cpf: string;
  birthDate: string;
  phone: string;
  address: string;
  mobility: string;
  clinicalRisk: string;
  requiresCompanion: boolean;
  companionName: string;
  companionPhone: string;
};

const EMPTY_FORM: PatientForm = {
  name: '', cpf: '', birthDate: '', phone: '', address: '',
  mobility: 'NORMAL', clinicalRisk: 'LOW',
  requiresCompanion: false, companionName: '', companionPhone: '',
};

export default function PatientsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<PatientForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['patients', search],
    queryFn: () => patientService.list({ search, limit: 50 }),
  });

  const create = useMutation({
    mutationFn: (body: PatientForm) => patientService.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setError('');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Erro ao criar paciente.');
    },
  });

  const items = data?.items ?? [];

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Pacientes</h2>
          <p className='text-sm text-slate-400'>{data?.total ?? 0} paciente(s) cadastrado(s)</p>
        </div>
        <button
          type='button'
          onClick={() => setShowModal(true)}
          className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 transition-colors'
        >
          + Novo Paciente
        </button>
      </div>

      {/* Search */}
      <input
        type='search'
        placeholder='Buscar por nome ou CPF…'
        className='w-full max-w-sm rounded-lg border border-border bg-slate-900 px-4 py-2 text-sm focus:border-cyan-700 focus:outline-none'
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-xs text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 text-left'>Nome</th>
                <th className='p-3 text-left'>CPF</th>
                <th className='p-3 text-left'>Mobilidade</th>
                <th className='p-3 text-left'>Risco</th>
                <th className='p-3 text-left'>Acomp.</th>
                <th className='p-3 text-left'>Cód. Op.</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6} className='p-6 text-center text-slate-500'>Nenhum paciente cadastrado</td></tr>
              )}
              {items.map((p: any) => (
                <tr key={p.id} className='border-t border-border hover:bg-slate-900/40 transition-colors'>
                  <td className='p-3 font-medium'>{p.name}</td>
                  <td className='p-3 font-mono text-xs'>{p.cpf}</td>
                  <td className='p-3 text-xs'>{MOBILITY_LABEL[p.mobility] ?? p.mobility}</td>
                  <td className='p-3'>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_BADGE[p.clinicalRisk] ?? 'text-slate-400'}`}>
                      {p.clinicalRisk}
                    </span>
                  </td>
                  <td className='p-3 text-center'>{p.requiresCompanion ? '👥' : '—'}</td>
                  <td className='p-3 font-mono text-xs text-slate-500'>{p.operationalId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
          <div className='w-full max-w-lg rounded-xl border border-border bg-panel p-6 space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-lg font-semibold'>Novo Paciente</h3>
              <button type='button' onClick={() => setShowModal(false)} className='text-slate-400 hover:text-slate-200'>✕</button>
            </div>
            {error && <p className='text-sm text-red-400'>{error}</p>}
            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Nome completo *</span>
                <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>CPF *</span>
                <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' placeholder='000.000.000-00' value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))} />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Data de Nascimento *</span>
                <input type='date' className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Telefone</span>
                <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Mobilidade</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.mobility} onChange={e => setForm(f => ({ ...f, mobility: e.target.value }))}>
                  <option value='NORMAL'>Normal</option>
                  <option value='WHEELCHAIR'>Cadeirante</option>
                  <option value='STRETCHER'>Maca</option>
                  <option value='OXYGEN'>Oxigênio</option>
                </select>
              </label>
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Endereço *</span>
                <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Risco Clínico</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.clinicalRisk} onChange={e => setForm(f => ({ ...f, clinicalRisk: e.target.value }))}>
                  <option value='LOW'>Baixo</option>
                  <option value='MEDIUM'>Médio</option>
                  <option value='HIGH'>Alto</option>
                  <option value='CRITICAL'>Crítico</option>
                </select>
              </label>
              <label className='flex items-center gap-2 pt-5'>
                <input type='checkbox' checked={form.requiresCompanion} onChange={e => setForm(f => ({ ...f, requiresCompanion: e.target.checked }))} />
                <span className='text-sm'>Requer acompanhante</span>
              </label>
              {form.requiresCompanion && (
                <>
                  <label className='space-y-1'>
                    <span className='text-xs text-slate-400'>Nome do acompanhante</span>
                    <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.companionName} onChange={e => setForm(f => ({ ...f, companionName: e.target.value }))} />
                  </label>
                  <label className='space-y-1'>
                    <span className='text-xs text-slate-400'>Telefone do acompanhante</span>
                    <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.companionPhone} onChange={e => setForm(f => ({ ...f, companionPhone: e.target.value }))} />
                  </label>
                </>
              )}
            </div>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={() => setShowModal(false)} className='rounded-lg border border-border px-4 py-2 text-sm hover:bg-slate-800 transition-colors'>Cancelar</button>
              <button
                type='button'
                onClick={() => create.mutate(form)}
                disabled={create.isPending}
                className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 transition-colors'
              >
                {create.isPending ? 'Salvando…' : 'Salvar Paciente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

