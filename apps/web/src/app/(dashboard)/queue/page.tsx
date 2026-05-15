'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueue } from '@/hooks/useQueue';
import { queueService } from '@/services/queue.service';
import { patientService } from '@/services/operational.service';
import type { QueueType } from '@/types';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-900 text-red-300',
  HIGH: 'bg-orange-900 text-orange-300',
  NORMAL: 'bg-slate-700 text-slate-300',
  PENDING: 'bg-slate-800 text-slate-400',
};

const CONFIRMATION_BADGE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-900 text-emerald-300',
  PENDING: 'bg-amber-900 text-amber-300',
  CANCELED: 'bg-red-900 text-red-300',
  UNREACHABLE: 'bg-slate-800 text-slate-400',
  WAITING_MANUAL_CONFIRMATION: 'bg-cyan-900 text-cyan-300',
};

type QueueForm = {
  patientId: string;
  destination: string;
  appointmentDate: string;
  priority: string;
  queueType: string;
  notes: string;
};
const EMPTY_FORM: QueueForm = {
  patientId: '', destination: '', appointmentDate: '',
  priority: 'NORMAL', queueType: 'LOGISTICS', notes: '',
};

export default function QueuePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<QueueType>('LOGISTICS');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<QueueForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const { data, isLoading } = useQueue({ type: activeTab, limit: 50 });
  const items = (data?.items ?? []) as any[];
  const total: number = data?.total ?? 0;

  const { data: patientsData } = useQuery({
    queryKey: ['patients-select'],
    queryFn: () => patientService.list({ limit: 200 }),
  });
  const patients = (patientsData?.items ?? []) as any[];

  const create = useMutation({
    mutationFn: (body: QueueForm) =>
      queueService.create({ ...body, status: 'WAITING', confirmationStatus: 'PENDING', appointmentDate: new Date(body.appointmentDate) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setError('');
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Erro ao criar entrada na fila.'),
  });

  const updateConfirmation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => queueService.updateConfirmation(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queue'] }),
  });

  const tabs: { value: QueueType; label: string; icon: string }[] = [
    { value: 'LOGISTICS', label: 'Fila Logística', icon: '🚐' },
    { value: 'MEDICAL', label: 'Fila Médica', icon: '🏥' },
  ];

  const filtered = search
    ? items.filter((q: any) =>
        q.patient?.name?.toLowerCase().includes(search.toLowerCase()) ||
        q.destination?.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Fila Operacional</h2>
          <p className='text-sm text-slate-400'>{total} paciente(s) na fila</p>
        </div>
        <button type='button' onClick={() => setShowModal(true)} className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 transition-colors'>
          + Adicionar à Fila
        </button>
      </div>

      <div className='flex gap-1 rounded-lg border border-border bg-panel p-1 w-fit'>
        {tabs.map((tab) => (
          <button key={tab.value} type='button' onClick={() => setActiveTab(tab.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.value ? 'bg-cyan-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <input type='search' placeholder='Buscar por paciente ou destino…'
        className='w-full max-w-sm rounded-lg border border-border bg-slate-900 px-4 py-2 text-sm focus:border-cyan-700 focus:outline-none'
        value={search} onChange={(e) => setSearch(e.target.value)} />

      {isLoading ? <LoadingSpinner /> : (
        <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-xs text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 text-left'>Paciente</th>
                <th className='p-3 text-left'>Destino</th>
                <th className='p-3 text-left'>Consulta</th>
                <th className='p-3 text-left'>Prioridade</th>
                <th className='p-3 text-left'>Confirmação</th>
                <th className='p-3 text-left'>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className='p-6 text-center text-slate-500'>Nenhum paciente nesta fila</td></tr>
              )}
              {filtered.map((q: any) => (
                <tr key={q.id} className='border-t border-border hover:bg-slate-900/40 transition-colors'>
                  <td className='p-3 font-medium'>{q.patient?.name ?? '—'}</td>
                  <td className='p-3 text-xs text-slate-300 max-w-[160px] truncate'>{q.destination}</td>
                  <td className='p-3 text-xs'>
                    {q.appointmentDate ? new Date(q.appointmentDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </td>
                  <td className='p-3'>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[q.priority] ?? 'text-slate-400'}`}>{q.priority}</span>
                  </td>
                  <td className='p-3'>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${CONFIRMATION_BADGE[q.confirmationStatus] ?? 'text-slate-400'}`}>
                      {q.confirmationStatus?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className='p-3'>
                    {q.confirmationStatus !== 'CONFIRMED' && (
                      <button type='button' onClick={() => updateConfirmation.mutate({ id: q.id, status: 'CONFIRMED' })}
                        className='rounded bg-emerald-900/50 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-800 transition-colors'>
                        ✓ Confirmar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
          <div className='w-full max-w-lg rounded-xl border border-border bg-panel p-6 space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-lg font-semibold'>Adicionar à Fila</h3>
              <button type='button' onClick={() => setShowModal(false)} className='text-slate-400 hover:text-slate-200'>✕</button>
            </div>
            {error && <p className='text-sm text-red-400'>{error}</p>}
            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Paciente *</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.patientId} onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}>
                  <option value=''>Selecionar paciente…</option>
                  {patients.map((p: any) => (<option key={p.id} value={p.id}>{p.name} — {p.cpf}</option>))}
                </select>
              </label>
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Destino *</span>
                <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))} placeholder='Hospital das Clínicas' />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Data/Hora Consulta *</span>
                <input type='datetime-local' className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.appointmentDate} onChange={(e) => setForm((f) => ({ ...f, appointmentDate: e.target.value }))} />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Tipo de Fila</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.queueType} onChange={(e) => setForm((f) => ({ ...f, queueType: e.target.value }))}>
                  <option value='LOGISTICS'>Logística</option>
                  <option value='MEDICAL'>Médica</option>
                </select>
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Prioridade</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                  <option value='PENDING'>Pendente</option>
                  <option value='NORMAL'>Normal</option>
                  <option value='HIGH'>Alta</option>
                  <option value='CRITICAL'>Crítica</option>
                </select>
              </label>
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Observações</span>
                <textarea rows={2} className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm resize-none' value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>
            </div>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={() => setShowModal(false)} className='rounded-lg border border-border px-4 py-2 text-sm hover:bg-slate-800 transition-colors'>Cancelar</button>
              <button type='button' onClick={() => create.mutate(form)} disabled={create.isPending || !form.patientId || !form.destination || !form.appointmentDate}
                className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 transition-colors'>
                {create.isPending ? 'Salvando…' : 'Adicionar à Fila'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

