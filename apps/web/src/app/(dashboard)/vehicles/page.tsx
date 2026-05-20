'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehicleService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { getVehicleStatusLabel, getVehicleTypeLabel } from '@/lib/i18n';

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'bg-emerald-900 text-emerald-300',
  ON_ROUTE: 'bg-cyan-900 text-cyan-300',
  MAINTENANCE: 'bg-amber-900 text-amber-300',
  INACTIVE: 'bg-slate-800 text-slate-400',
};

type VehicleForm = { plate: string; model: string; type: string; capacity: string; wheelchair: boolean; stretcher: boolean };
const EMPTY_FORM: VehicleForm = { plate: '', model: '', type: 'VAN', capacity: '8', wheelchair: false, stretcher: false };

export default function VehiclesPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<VehicleForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehicleService.list({ limit: 50 }),
  });

  const create = useMutation({
    mutationFn: (body: VehicleForm) =>
      vehicleService.create({ ...body, capacity: Number(body.capacity), status: 'AVAILABLE', active: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['vehicles'] }); setShowModal(false); setForm(EMPTY_FORM); setError(''); },
    onError: (err: any) => setError(err?.response?.data?.message ?? 'Erro ao cadastrar veículo.'),
  });

  const items = data?.items ?? [];

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Frota</h2>
          <p className='text-sm text-slate-400'>{data?.total ?? 0} veículo(s) cadastrado(s)</p>
        </div>
        <button type='button' onClick={() => setShowModal(true)} className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 transition-colors'>
          + Novo Veículo
        </button>
      </div>

      {isLoading ? <LoadingSpinner /> : (
        <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-xs text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 text-left'>Placa</th>
                <th className='p-3 text-left'>Modelo</th>
                <th className='p-3 text-left'>Tipo</th>
                <th className='p-3 text-left'>Capacidade</th>
                <th className='p-3 text-left'>Status</th>
                <th className='p-3 text-left'>Acessibil.</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={6} className='p-6 text-center text-slate-500'>Nenhum veículo cadastrado</td></tr>}
              {items.map((v: any) => (
                <tr key={v.id} className='border-t border-border hover:bg-slate-900/40 transition-colors'>
                  <td className='p-3 font-mono font-bold'>{v.plate}</td>
                  <td className='p-3'>{v.model}</td>
                  <td className='p-3 text-xs'>{getVehicleTypeLabel(v.type)}</td>
                  <td className='p-3 text-center'>{v.capacity}</td>
                  <td className='p-3'>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[v.status] ?? 'text-slate-400'}`}>{getVehicleStatusLabel(v.status)}</span>
                  </td>
                  <td className='p-3 text-xs'>
                    {[v.wheelchair && '♿', v.stretcher && '🛏'].filter(Boolean).join(' ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60'>
          <div className='w-full max-w-md rounded-xl border border-border bg-panel p-6 space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-lg font-semibold'>Novo Veículo</h3>
              <button type='button' onClick={() => setShowModal(false)} className='text-slate-400 hover:text-slate-200'>✕</button>
            </div>
            {error && <p className='text-sm text-red-400'>{error}</p>}
            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Placa *</span>
                <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm uppercase' placeholder='AAA-0000' value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value.toUpperCase() }))} />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Modelo *</span>
                <input className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Tipo</span>
                <select className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value='VAN'>Van</option>
                  <option value='BUS'>Micro-ônibus</option>
                  <option value='AMBULANCE'>Ambulância</option>
                  <option value='CAR'>Carro</option>
                  <option value='ADAPTED'>Adaptado</option>
                </select>
              </label>
              <label className='space-y-1'>
                <span className='text-xs text-slate-400'>Capacidade</span>
                <input type='number' min={1} className='w-full rounded bg-slate-900 border border-border px-3 py-2 text-sm' value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
              </label>
              <label className='flex items-center gap-2 pt-4'>
                <input type='checkbox' checked={form.wheelchair} onChange={e => setForm(f => ({ ...f, wheelchair: e.target.checked }))} />
                <span className='text-sm'>Cadeirante ♿</span>
              </label>
              <label className='flex items-center gap-2 pt-4'>
                <input type='checkbox' checked={form.stretcher} onChange={e => setForm(f => ({ ...f, stretcher: e.target.checked }))} />
                <span className='text-sm'>Maca 🛏</span>
              </label>
            </div>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={() => setShowModal(false)} className='rounded-lg border border-border px-4 py-2 text-sm hover:bg-slate-800 transition-colors'>Cancelar</button>
              <button type='button' onClick={() => create.mutate(form)} disabled={create.isPending} className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 disabled:opacity-50 transition-colors'>
                {create.isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

