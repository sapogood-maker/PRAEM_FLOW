'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { healthcareLocationService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const TYPE_LABEL: Record<string, string> = {
  HOSPITAL: '🏥 Hospital',
  CLINIC: '🏨 Clínica',
  LAB: '🔬 Laboratório',
  UBS: '🩺 UBS',
  SPECIALTY_CENTER: '⚕️ Centro Especialidade',
  HEMODIALYSIS: '💉 Hemodiálise',
  ONCOLOGY_CENTER: '🎗️ Oncologia',
};

const TYPE_BADGE: Record<string, string> = {
  HOSPITAL: 'bg-blue-900 text-blue-300',
  CLINIC: 'bg-teal-900 text-teal-300',
  LAB: 'bg-violet-900 text-violet-300',
  UBS: 'bg-emerald-900 text-emerald-300',
  SPECIALTY_CENTER: 'bg-cyan-900 text-cyan-300',
  HEMODIALYSIS: 'bg-red-900 text-red-300',
  ONCOLOGY_CENTER: 'bg-pink-900 text-pink-300',
};

const ALL_TYPES = Object.keys(TYPE_LABEL);

const SPECIALTY_PRESETS = [
  'Oncologia', 'Hemodiálise', 'Cardiologia', 'Neurologia',
  'Exames', 'Fisioterapia', 'Quimioterapia', 'Ortopedia',
  'Oftalmologia', 'Ginecologia', 'Pediatria', 'Psiquiatria',
];

type LocationForm = {
  name: string;
  type: string;
  address: string;
  number: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: string;
  longitude: string;
  contactPhone: string;
  notes: string;
  specialties: string[];
};

const EMPTY_FORM: LocationForm = {
  name: '', type: 'HOSPITAL', address: '', number: '', district: '',
  city: '', state: '', zipCode: '', latitude: '', longitude: '',
  contactPhone: '', notes: '', specialties: [],
};

export default function HealthcareLocationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(EMPTY_FORM);
  const [specialtyInput, setSpecialtyInput] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['healthcare-locations', search, filterType],
    queryFn: () =>
      healthcareLocationService.list({
        ...(search ? { search } : {}),
        ...(filterType ? { type: filterType } : {}),
        limit: 100,
      }),
  });

  const save = useMutation({
    mutationFn: (body: any) =>
      editId
        ? healthcareLocationService.update(editId, body)
        : healthcareLocationService.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['healthcare-locations'] });
      closeModal();
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Erro ao salvar destino.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => healthcareLocationService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['healthcare-locations'] }),
  });

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
    setShowModal(true);
  }

  function openEdit(loc: any) {
    setEditId(loc.id);
    setForm({
      name: loc.name ?? '',
      type: loc.type ?? 'HOSPITAL',
      address: loc.address ?? '',
      number: loc.number ?? '',
      district: loc.district ?? '',
      city: loc.city ?? '',
      state: loc.state ?? '',
      zipCode: loc.zipCode ?? '',
      latitude: loc.latitude != null ? String(loc.latitude) : '',
      longitude: loc.longitude != null ? String(loc.longitude) : '',
      contactPhone: loc.contactPhone ?? '',
      notes: loc.notes ?? '',
      specialties: (loc.specialties ?? []).map((s: any) => s.specialty),
    });
    setError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setError('');
  }

  function addSpecialty(s: string) {
    const val = s.trim();
    if (val && !form.specialties.includes(val)) {
      setForm((f) => ({ ...f, specialties: [...f.specialties, val] }));
    }
    setSpecialtyInput('');
  }

  function removeSpecialty(s: string) {
    setForm((f) => ({ ...f, specialties: f.specialties.filter((x) => x !== s) }));
  }

  function handleSubmit() {
    const body: any = {
      ...form,
      latitude: form.latitude ? parseFloat(form.latitude) : undefined,
      longitude: form.longitude ? parseFloat(form.longitude) : undefined,
    };
    save.mutate(body);
  }

  const items = data?.items ?? [];

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Destinos Médicos</h2>
          <p className='text-sm text-slate-400'>{data?.total ?? 0} destino(s) cadastrado(s)</p>
        </div>
        <button
          type='button'
          onClick={openCreate}
          className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 transition-colors'
        >
          + Novo Destino
        </button>
      </div>

      {/* Filters */}
      <div className='flex flex-wrap gap-3'>
        <input
          type='search'
          placeholder='Buscar por nome, cidade, bairro…'
          className='w-full max-w-xs rounded-lg border border-border bg-slate-900 px-4 py-2 text-sm focus:border-cyan-700 focus:outline-none'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className='rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm'
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value=''>Todos os tipos</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {items.length === 0 && (
            <p className='col-span-full p-8 text-center text-slate-500'>Nenhum destino cadastrado</p>
          )}
          {items.map((loc: any) => (
            <div
              key={loc.id}
              className='rounded-xl border border-border bg-panel p-4 space-y-2 hover:border-slate-600 transition-colors'
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='space-y-0.5'>
                  <p className='font-semibold text-slate-100'>{loc.name}</p>
                  <p className='text-xs text-slate-400'>{loc.city} — {loc.state}</p>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[loc.type] ?? 'bg-slate-800 text-slate-400'}`}>
                  {TYPE_LABEL[loc.type] ?? loc.type}
                </span>
              </div>
              <p className='text-xs text-slate-500 truncate'>
                {loc.address}{loc.number ? `, ${loc.number}` : ''}{loc.district ? ` — ${loc.district}` : ''}
              </p>
              {loc.specialties?.length > 0 && (
                <div className='flex flex-wrap gap-1'>
                  {loc.specialties.map((s: any) => (
                    <span key={s.specialty} className='rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400'>
                      {s.specialty}
                    </span>
                  ))}
                </div>
              )}
              {loc.latitude && loc.longitude && (
                <p className='text-[10px] text-slate-600 font-mono'>
                  📍 {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                </p>
              )}
              <div className='flex items-center justify-between pt-1'>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${loc.active ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                  {loc.active ? 'Ativo' : 'Inativo'}
                </span>
                <div className='flex gap-2'>
                  <button
                    type='button'
                    onClick={() => openEdit(loc)}
                    className='text-xs text-cyan-400 hover:text-cyan-300 transition-colors'
                  >
                    ✏️ Editar
                  </button>
                  <button
                    type='button'
                    onClick={() => { if (window.confirm('Remover este destino?')) remove.mutate(loc.id); }}
                    className='text-xs text-red-400 hover:text-red-300 transition-colors'
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <div className='fixed inset-0 z-50 flex items-start justify-center bg-black/70 overflow-y-auto py-8'>
          <div className='w-full max-w-2xl rounded-xl border border-border bg-panel p-6 space-y-4 mx-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-lg font-semibold'>{editId ? 'Editar Destino' : 'Novo Destino Médico'}</h3>
              <button type='button' onClick={closeModal} className='text-slate-400 hover:text-slate-200'>✕</button>
            </div>
            {error && <p className='text-sm text-red-400'>{error}</p>}

            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Nome do estabelecimento *</span>
                <input
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder='Hospital das Clínicas'
                />
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Tipo *</span>
                <select
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {ALL_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Telefone de contato</span>
                <input
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.contactPhone}
                  onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  placeholder='(00) 0000-0000'
                />
              </label>

              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Endereço (rua) *</span>
                <input
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder='Rua das Flores'
                />
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Número</span>
                <input
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                />
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Bairro</span>
                <input
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.district}
                  onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))}
                />
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Cidade *</span>
                <input
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Estado *</span>
                <input
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  placeholder='SP'
                  maxLength={2}
                />
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>CEP</span>
                <input
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.zipCode}
                  onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
                  placeholder='00000-000'
                />
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Latitude</span>
                <input
                  type='number'
                  step='0.000001'
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.latitude}
                  onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                  placeholder='-23.550520'
                />
              </label>

              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Longitude</span>
                <input
                  type='number'
                  step='0.000001'
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                  value={form.longitude}
                  onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                  placeholder='-46.633309'
                />
              </label>

              <div className='col-span-2 space-y-2'>
                <span className='text-xs text-slate-400'>Especialidades atendidas</span>
                <div className='flex gap-1 flex-wrap'>
                  {SPECIALTY_PRESETS.map((s) => (
                    <button
                      key={s}
                      type='button'
                      onClick={() => addSpecialty(s)}
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${form.specialties.includes(s) ? 'bg-cyan-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className='flex gap-2'>
                  <input
                    className='flex-1 rounded bg-slate-900 border border-border px-3 py-2 text-sm'
                    value={specialtyInput}
                    onChange={(e) => setSpecialtyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSpecialty(specialtyInput); } }}
                    placeholder='Adicionar especialidade personalizada…'
                  />
                  <button
                    type='button'
                    onClick={() => addSpecialty(specialtyInput)}
                    className='rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 transition-colors'
                  >
                    +
                  </button>
                </div>
                {form.specialties.length > 0 && (
                  <div className='flex flex-wrap gap-1'>
                    {form.specialties.map((s) => (
                      <span key={s} className='flex items-center gap-1 rounded bg-cyan-900/50 px-2 py-0.5 text-xs text-cyan-300'>
                        {s}
                        <button type='button' onClick={() => removeSpecialty(s)} className='hover:text-red-300'>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <label className='col-span-2 space-y-1'>
                <span className='text-xs text-slate-400'>Observações</span>
                <textarea
                  rows={2}
                  className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm resize-none'
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
            </div>

            <div className='flex justify-end gap-3'>
              <button type='button' onClick={closeModal} className='rounded-lg border border-border px-4 py-2 text-sm hover:bg-slate-800 transition-colors'>
                Cancelar
              </button>
              <button
                type='button'
                onClick={handleSubmit}
                disabled={save.isPending || !form.name || !form.address || !form.city || !form.state}
                className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 transition-colors'
              >
                {save.isPending ? 'Salvando…' : (editId ? 'Salvar Alterações' : 'Cadastrar Destino')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
