'use client';

import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useQueue } from '@/hooks/useQueue';
import { queueService } from '@/services/queue.service';
import { patientService, healthcareLocationService } from '@/services/operational.service';
import type { QueueType } from '@/types';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { getPriorityLabel, getConfirmationStatusLabel } from '@/lib/i18n';
import { useOperationalDispatchStore } from '@/store/operationalDispatch.store';

const PRIORITY_BADGE: Record<string, string> = {
  EMERGENCY: 'bg-red-600 text-white animate-pulse',
  CRITICAL: 'bg-red-900 text-red-300',
  HIGH: 'bg-orange-900 text-orange-300',
  NORMAL: 'bg-slate-700 text-slate-300',
  LOW: 'bg-slate-800 text-slate-500',
  PENDING: 'bg-slate-800 text-slate-400',
};

const CONFIRMATION_BADGE: Record<string, string> = {
  CONFIRMED: 'bg-emerald-900 text-emerald-300',
  PENDING: 'bg-amber-900 text-amber-300',
  CANCELED: 'bg-red-900 text-red-300',
  UNREACHABLE: 'bg-slate-800 text-slate-400',
  WAITING_MANUAL_CONFIRMATION: 'bg-cyan-900 text-cyan-300',
};

const TYPE_LABEL: Record<string, string> = {
  HOSPITAL: '🏥',
  CLINIC: '🏨',
  LAB: '🔬',
  UBS: '🩺',
  SPECIALTY_CENTER: '⚕️',
  HEMODIALYSIS: '💉',
  ONCOLOGY_CENTER: '🎗️',
};

type QueueForm = {
  patientId: string;
  healthcareLocationId: string;
  appointmentDate: string;
  priority: string;
  queueType: string;
  notes: string;
};
const EMPTY_FORM: QueueForm = {
  patientId: '', healthcareLocationId: '', appointmentDate: '',
  priority: 'NORMAL', queueType: 'LOGISTICS', notes: '',
};

export default function QueuePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<QueueType>('LOGISTICS');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<QueueForm>(EMPTY_FORM);
  const [locationSearch, setLocationSearch] = useState('');
  const [error, setError] = useState('');
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const dragItemRef = useRef<any>(null);

  const { addToDispatch, pendingDispatch } = useOperationalDispatchStore();

  const { data, isLoading } = useQueue({ type: activeTab, limit: 50 });
  const items = (data?.items ?? []) as any[];
  const total: number = data?.total ?? 0;

  const { data: patientsData } = useQuery({
    queryKey: ['patients-select'],
    queryFn: () => patientService.list({ limit: 200 }),
  });
  const patients = (patientsData?.items ?? []) as any[];

  const { data: locationsData } = useQuery({
    queryKey: ['healthcare-locations-select', locationSearch],
    queryFn: () => healthcareLocationService.list({ limit: 100, active: 'true', ...(locationSearch ? { search: locationSearch } : {}) }),
  });
  const locations = (locationsData?.items ?? []) as any[];

  const create = useMutation({
    mutationFn: (body: QueueForm) => {
      const selectedLoc = locations.find((l: any) => l.id === body.healthcareLocationId);
      return queueService.create({
        patientId: body.patientId,
        healthcareLocationId: body.healthcareLocationId || undefined,
        destination: selectedLoc?.name ?? '',
        lat: selectedLoc?.latitude ?? undefined,
        lng: selectedLoc?.longitude ?? undefined,
        status: 'WAITING',
        confirmationStatus: 'PENDING',
        appointmentDate: new Date(body.appointmentDate),
        priority: body.priority,
        queueType: body.queueType,
        notes: body.notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
      setLocationSearch('');
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
        q.healthcareLocation?.name?.toLowerCase().includes(search.toLowerCase()) ||
        q.destination?.toLowerCase().includes(search.toLowerCase()))
    : items;

  function toggleLocal(id: string) {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function sendToDispatch(items: any[]) {
    items.forEach((q: any) => addToDispatch({
      id: q.id,
      patientId: q.patientId,
      priority: q.priority,
      status: q.status,
      destination: q.destination,
      healthcareLocationId: q.healthcareLocationId,
      appointmentDate: q.appointmentDate,
      confirmationStatus: q.confirmationStatus,
      notes: q.notes,
      patient: q.patient,
      healthcareLocation: q.healthcareLocation,
    }));
    setLocalSelected(new Set());
    router.push('/dispatch');
  }

  const selectedItems = filtered.filter((q: any) => localSelected.has(q.id));
  const alreadyInDispatch = (id: string) => pendingDispatch.some((p) => p.id === id);

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Fila Operacional</h2>
          <p className='text-sm text-slate-400'>{total} paciente(s) na fila</p>
        </div>
        <div className='flex items-center gap-2'>
          {localSelected.size > 0 && (
            <button
              type='button'
              onClick={() => sendToDispatch(selectedItems)}
              className='flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 transition-colors'
            >
              🚐 Enviar para Despacho ({localSelected.size})
            </button>
          )}
          <button type='button' onClick={() => setShowModal(true)} className='rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600 transition-colors'>
            + Adicionar à Fila
          </button>
        </div>
      </div>

      {/* Drag-and-drop drop zone for dispatch */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (dragItemRef.current) {
            sendToDispatch([dragItemRef.current]);
            dragItemRef.current = null;
          }
        }}
        className={`rounded-xl border-2 border-dashed px-4 py-3 text-center text-sm transition-colors ${
          dragOver
            ? 'border-cyan-500 bg-cyan-950/30 text-cyan-300'
            : 'border-slate-700 text-slate-500'
        }`}
      >
        {dragOver ? '🚐 Soltar aqui para enviar para Despacho' : 'Arraste pacientes aqui → Despacho'}
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
                <th className='p-3 w-10'>
                  <input
                    type='checkbox'
                    className='accent-cyan-500'
                    checked={filtered.length > 0 && filtered.every((q: any) => localSelected.has(q.id))}
                    onChange={(e) => {
                      if (e.target.checked) setLocalSelected(new Set(filtered.map((q: any) => q.id)));
                      else setLocalSelected(new Set());
                    }}
                  />
                </th>
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
                <tr><td colSpan={7} className='p-6 text-center text-slate-500'>Nenhum paciente nesta fila</td></tr>
              )}
              {filtered.map((q: any) => {
                const loc = q.healthcareLocation;
                const isSelected = localSelected.has(q.id);
                const inDispatch = alreadyInDispatch(q.id);
                return (
                  <tr
                    key={q.id}
                    draggable
                    onDragStart={() => { dragItemRef.current = q; }}
                    onDragEnd={() => { dragItemRef.current = null; }}
                    className={`border-t border-border transition-colors cursor-grab active:cursor-grabbing ${
                      isSelected ? 'bg-cyan-950/30 border-l-2 border-l-cyan-600' :
                      inDispatch ? 'bg-slate-800/30 opacity-60' :
                      'hover:bg-slate-900/40'
                    }`}
                  >
                    <td className='p-3'>
                      <input
                        type='checkbox'
                        className='accent-cyan-500'
                        checked={isSelected}
                        disabled={inDispatch}
                        onChange={() => toggleLocal(q.id)}
                      />
                    </td>
                    <td className='p-3 font-medium'>
                      <span className='flex items-center gap-1.5 flex-wrap'>
                        {q.patient?.name ?? '—'}
                        {inDispatch && (
                          <span className='inline-flex items-center gap-1 rounded-full bg-cyan-900/70 px-2 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-800/60'>
                            🚐 EM DESPACHO
                          </span>
                        )}
                      </span>
                    </td>
                    <td className='p-3 text-xs text-slate-300 max-w-[200px]'>
                      {loc ? (
                        <span className='flex flex-col gap-0.5'>
                          <span className='font-medium'>{TYPE_LABEL[loc.type] ?? ''} {loc.name}</span>
                          <span className='text-slate-500'>{loc.city}</span>
                        </span>
                      ) : (
                        <span className='truncate'>{q.destination ?? '—'}</span>
                      )}
                    </td>
                    <td className='p-3 text-xs'>
                      {q.appointmentDate ? new Date(q.appointmentDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className='p-3'>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[q.priority] ?? 'text-slate-400'}`}>{getPriorityLabel(q.priority)}</span>
                    </td>
                    <td className='p-3'>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${CONFIRMATION_BADGE[q.confirmationStatus] ?? 'text-slate-400'}`}>
                        {getConfirmationStatusLabel(q.confirmationStatus)}
                      </span>
                    </td>
                    <td className='p-3'>
                      <div className='flex items-center gap-1'>
                        {q.confirmationStatus !== 'CONFIRMED' && (
                          <button type='button' onClick={() => updateConfirmation.mutate({ id: q.id, status: 'CONFIRMED' })}
                            className='rounded bg-emerald-900/50 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-800 transition-colors'>
                            ✓ Confirmar
                          </button>
                        )}
                        {!inDispatch && (
                          <button
                            type='button'
                            onClick={() => sendToDispatch([q])}
                            className='rounded bg-cyan-900/50 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-800 transition-colors'
                          >
                            → Despacho
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
          <div className='w-full max-w-lg rounded-xl border border-border bg-panel p-6 space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-lg font-semibold'>Adicionar à Fila</h3>
              <button type='button' onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setLocationSearch(''); }} className='text-slate-400 hover:text-slate-200'>✕</button>
            </div>
            {error && <p className='text-sm text-red-400'>{error}</p>}
            <div className='grid gap-3 sm:grid-cols-2'>
              {/* Patient */}
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Paciente *</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.patientId} onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}>
                  <option value=''>Selecionar paciente…</option>
                  {patients.map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </label>

              {/* Destination — searchable from registered locations */}
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Destino Médico *</span>
                <input
                  type='search'
                  className='w-full rounded-t bg-slate-900 border border-border px-3 py-2 text-sm focus:border-cyan-700 focus:outline-none'
                  placeholder='Buscar hospital, clínica, UBS…'
                  value={locationSearch}
                  onChange={(e) => { setLocationSearch(e.target.value); setForm((f) => ({ ...f, healthcareLocationId: '' })); }}
                />
                {locations.length > 0 ? (
                  <select
                    className='w-full rounded-b bg-slate-900 border-x border-b border-border px-3 py-2 text-sm'
                    value={form.healthcareLocationId}
                    onChange={(e) => setForm((f) => ({ ...f, healthcareLocationId: e.target.value }))}
                    size={Math.min(locations.length + 1, 6)}
                  >
                    <option value=''>— Selecionar destino —</option>
                    {locations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {TYPE_LABEL[l.type] ?? ''} {l.name} — {l.city}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className='text-xs text-amber-400 pt-1'>
                    Nenhum destino encontrado. <a href='/healthcare-locations' className='underline text-cyan-400'>Cadastrar destino</a>
                  </p>
                )}
              </label>

              {/* Date */}
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Data/Hora Consulta *</span>
                <input type='datetime-local' className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.appointmentDate} onChange={(e) => setForm((f) => ({ ...f, appointmentDate: e.target.value }))} />
              </label>

              {/* Queue type */}
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Tipo de Fila</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.queueType} onChange={(e) => setForm((f) => ({ ...f, queueType: e.target.value }))}>
                  <option value='LOGISTICS'>Logística</option>
                  <option value='MEDICAL'>Médica</option>
                </select>
              </label>

              {/* Priority */}
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Prioridade</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                  <option value='EMERGENCY'>🚨 Emergência</option>
                  <option value='PENDING'>Pendente</option>
                  <option value='NORMAL'>Normal</option>
                  <option value='HIGH'>Alta</option>
                  <option value='CRITICAL'>Crítica</option>
                  <option value='LOW'>Baixa</option>
                </select>
              </label>

              {/* Notes */}
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Observações</span>
                <textarea rows={2} className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm resize-none' value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </label>
            </div>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setLocationSearch(''); }} className='rounded-lg border border-border px-4 py-2 text-sm hover:bg-slate-800 transition-colors'>Cancelar</button>
              <button type='button' onClick={() => create.mutate(form)}
                disabled={create.isPending || !form.patientId || !form.healthcareLocationId || !form.appointmentDate}
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

