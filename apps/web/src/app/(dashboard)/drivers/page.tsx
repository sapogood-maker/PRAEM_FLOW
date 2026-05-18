'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Wifi, WifiOff, Truck, Smartphone, Clock, Plus,
  Pencil, KeyRound, PowerOff, Power, X, RefreshCw, Search,
  ShieldAlert, CircleDot,
} from 'lucide-react';
import { driverService, vehicleService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverStatus = 'AVAILABLE' | 'ON_ROUTE' | 'REST' | 'OFFLINE';

interface DriverUser { id: string; name: string; email: string; active: boolean; lastLoginAt: string | null }
interface DriverDevice { id: string; name: string; lastSeenAt: string | null; vehicleId: string | null; platform?: string }
interface Driver {
  id: string;
  status: DriverStatus;
  active: boolean;
  cnh: string;
  cnhExpiry: string | null;
  defaultVehicleId: string | null;
  user: DriverUser;
  devices: DriverDevice[];
}
interface OnlineDevice { driverId: string | null; lastSeenAt: string }
interface Vehicle { id: string; plate: string; model: string }

// ─── Status configs ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<DriverStatus, { label: string; cls: string }> = {
  AVAILABLE:  { label: 'Disponível',  cls: 'bg-emerald-900 text-emerald-300' },
  ON_ROUTE:   { label: 'Em Rota',     cls: 'bg-cyan-900 text-cyan-300' },
  REST:       { label: 'Descanso',    cls: 'bg-amber-900 text-amber-300' },
  OFFLINE:    { label: 'Offline',     cls: 'bg-slate-800 text-slate-400' },
};

function StatusBadge({ status }: { status: DriverStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.OFFLINE;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function OnlinePulse({ online }: { online: boolean }) {
  return online ? (
    <span className='inline-flex items-center gap-1 text-xs font-medium text-emerald-400'>
      <span className='relative flex h-2 w-2'>
        <span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' />
        <span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-400' />
      </span>
      Online
    </span>
  ) : (
    <span className='inline-flex items-center gap-1 text-xs text-slate-500'>
      <CircleDot size={8} />
      Offline
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDateOnly(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className='flex items-center gap-4 rounded-xl border border-border bg-panel px-5 py-4'>
      <div className={`rounded-lg p-2 ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className='text-2xl font-bold text-slate-100'>{value}</p>
        <p className='text-xs text-slate-400'>{label}</p>
      </div>
    </div>
  );
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

interface DriverFormData {
  name: string; email: string; password: string;
  cnh: string; cnhExpiry: string; phone: string; defaultVehicleId: string;
}

const EMPTY_FORM: DriverFormData = { name: '', email: '', password: '', cnh: '', cnhExpiry: '', phone: '', defaultVehicleId: '' };

function CreateEditModal({
  driver,
  vehicles,
  onClose,
  onSave,
  saving,
}: {
  driver: Driver | null;
  vehicles: Vehicle[];
  onClose: () => void;
  onSave: (data: Partial<DriverFormData>) => void;
  saving: boolean;
}) {
  const isEdit = !!driver;
  const [form, setForm] = useState<DriverFormData>(() => isEdit ? {
    name: driver.user.name,
    email: driver.user.email,
    password: '',
    cnh: driver.cnh,
    cnhExpiry: driver.cnhExpiry ? driver.cnhExpiry.slice(0, 10) : '',
    phone: '',
    defaultVehicleId: driver.defaultVehicleId ?? '',
  } : { ...EMPTY_FORM });

  const set = (k: keyof DriverFormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const Field = ({ label, name, type = 'text', required = false }: { label: string; name: keyof DriverFormData; type?: string; required?: boolean }) => (
    <div>
      <label className='mb-1 block text-xs text-slate-400'>{label}{required && <span className='ml-0.5 text-red-500'>*</span>}</label>
      <input
        type={type}
        value={form[name]}
        onChange={e => set(name, e.target.value)}
        className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-700 focus:outline-none'
        required={required}
      />
    </div>
  );

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm'>
      <div className='w-full max-w-lg rounded-2xl border border-border bg-panel shadow-2xl'>
        <div className='flex items-center justify-between border-b border-border px-6 py-4'>
          <h3 className='font-semibold text-slate-100'>{isEdit ? 'Editar Motorista' : 'Novo Motorista Operacional'}</h3>
          <button onClick={onClose} className='text-slate-400 hover:text-slate-200'><X size={18} /></button>
        </div>
        <form
          className='space-y-4 px-6 py-5'
          onSubmit={e => { e.preventDefault(); onSave(isEdit ? { cnh: form.cnh, cnhExpiry: form.cnhExpiry, defaultVehicleId: form.defaultVehicleId } : form); }}
        >
          <div className='grid grid-cols-2 gap-4'>
            <Field label='Nome completo' name='name' required={!isEdit} />
            <Field label='Email' name='email' type='email' required={!isEdit} />
          </div>
          {!isEdit && (
            <Field label='Senha inicial' name='password' type='password' required />
          )}
          <div className='grid grid-cols-2 gap-4'>
            <Field label='CNH' name='cnh' required />
            <Field label='Validade CNH' name='cnhExpiry' type='date' required />
          </div>
          {!isEdit && <Field label='Telefone' name='phone' type='tel' />}
          <div>
            <label className='mb-1 block text-xs text-slate-400'>Veículo Padrão</label>
            <select
              value={form.defaultVehicleId}
              onChange={e => set('defaultVehicleId', e.target.value)}
              className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-700 focus:outline-none'
            >
              <option value=''>— Nenhum —</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate} — {v.model}</option>
              ))}
            </select>
          </div>
          <div className='flex justify-end gap-3 pt-2'>
            <button type='button' onClick={onClose} className='rounded-lg border border-border px-4 py-2 text-sm text-slate-400 hover:text-slate-200'>
              Cancelar
            </button>
            <button
              type='submit'
              disabled={saving}
              className='rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-50'
            >
              {saving ? 'Salvando…' : isEdit ? 'Salvar Alterações' : 'Criar Motorista'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ driver, onClose, onSave, saving }: {
  driver: Driver; onClose: () => void; onSave: (pwd: string) => void; saving: boolean;
}) {
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = pwd && confirm && pwd !== confirm;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm'>
      <div className='w-full max-w-md rounded-2xl border border-border bg-panel shadow-2xl'>
        <div className='flex items-center justify-between border-b border-border px-6 py-4'>
          <div className='flex items-center gap-2'>
            <KeyRound size={16} className='text-amber-400' />
            <h3 className='font-semibold text-slate-100'>Resetar Senha</h3>
          </div>
          <button onClick={onClose} className='text-slate-400 hover:text-slate-200'><X size={18} /></button>
        </div>
        <div className='px-6 py-5'>
          <p className='mb-4 text-sm text-slate-400'>
            Definindo nova senha para <span className='font-medium text-slate-200'>{driver.user.name}</span>.
          </p>
          <div className='space-y-3'>
            <div>
              <label className='mb-1 block text-xs text-slate-400'>Nova senha<span className='ml-0.5 text-red-500'>*</span></label>
              <input
                type='password'
                value={pwd}
                onChange={e => setPwd(e.target.value)}
                className='w-full rounded-lg border border-border bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-cyan-700 focus:outline-none'
              />
            </div>
            <div>
              <label className='mb-1 block text-xs text-slate-400'>Confirmar senha<span className='ml-0.5 text-red-500'>*</span></label>
              <input
                type='password'
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className={`w-full rounded-lg border bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none ${mismatch ? 'border-red-600 focus:border-red-500' : 'border-border focus:border-cyan-700'}`}
              />
              {mismatch && <p className='mt-1 text-xs text-red-400'>Senhas não coincidem</p>}
            </div>
          </div>
          <div className='mt-5 flex justify-end gap-3'>
            <button onClick={onClose} className='rounded-lg border border-border px-4 py-2 text-sm text-slate-400 hover:text-slate-200'>Cancelar</button>
            <button
              onClick={() => !mismatch && pwd && onSave(pwd)}
              disabled={saving || !pwd || !confirm || !!mismatch}
              className='rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50'
            >
              {saving ? 'Salvando…' : 'Redefinir Senha'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Toggle Modal ─────────────────────────────────────────────────────

function ConfirmToggleModal({ driver, onClose, onConfirm, saving }: {
  driver: Driver; onClose: () => void; onConfirm: () => void; saving: boolean;
}) {
  const deactivate = driver.active;
  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm'>
      <div className='w-full max-w-sm rounded-2xl border border-border bg-panel shadow-2xl'>
        <div className='flex items-center justify-between border-b border-border px-6 py-4'>
          <div className='flex items-center gap-2'>
            <ShieldAlert size={16} className={deactivate ? 'text-red-400' : 'text-emerald-400'} />
            <h3 className='font-semibold text-slate-100'>{deactivate ? 'Desativar Motorista' : 'Ativar Motorista'}</h3>
          </div>
          <button onClick={onClose} className='text-slate-400 hover:text-slate-200'><X size={18} /></button>
        </div>
        <div className='px-6 py-5'>
          <p className='text-sm text-slate-300'>
            {deactivate
              ? <>Desativar <span className='font-medium'>{driver.user.name}</span>? O motorista não conseguirá fazer login no tablet.</>
              : <>Ativar <span className='font-medium'>{driver.user.name}</span>? O motorista poderá fazer login normalmente.</>}
          </p>
          <div className='mt-5 flex justify-end gap-3'>
            <button onClick={onClose} className='rounded-lg border border-border px-4 py-2 text-sm text-slate-400 hover:text-slate-200'>Cancelar</button>
            <button
              onClick={onConfirm}
              disabled={saving}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${deactivate ? 'bg-red-700 hover:bg-red-600' : 'bg-emerald-700 hover:bg-emerald-600'}`}
            >
              {saving ? 'Aguarde…' : deactivate ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type FilterTab = 'ALL' | DriverStatus | 'INACTIVE';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL',       label: 'Todos' },
  { key: 'AVAILABLE', label: 'Disponível' },
  { key: 'ON_ROUTE',  label: 'Em Rota' },
  { key: 'REST',      label: 'Descanso' },
  { key: 'OFFLINE',   label: 'Offline' },
  { key: 'INACTIVE',  label: 'Inativos' },
];

export default function DriversPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<FilterTab>('ALL');

  // modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Driver | null>(null);
  const [resetTarget, setResetTarget] = useState<Driver | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Driver | null>(null);

  // ── data ──────────────────────────────────────────────────────────────────
  const { data: driversData, isLoading } = useQuery({
    queryKey: ['drivers', search],
    queryFn: () => driverService.list({ search, limit: 100 }),
  });

  const { data: onlineDevices = [] } = useQuery<OnlineDevice[]>({
    queryKey: ['drivers-online'],
    queryFn: () => driverService.online(),
    refetchInterval: 30_000,
  });

  const { data: vehiclesData } = useQuery({
    queryKey: ['vehicles-all'],
    queryFn: () => vehicleService.list({ limit: 200 }),
  });

  const vehicles: Vehicle[] = vehiclesData?.items ?? [];

  const onlineDriverIds = useMemo(
    () => new Set((onlineDevices as OnlineDevice[]).map(d => d.driverId).filter(Boolean)),
    [onlineDevices],
  );

  const allDrivers: Driver[] = driversData?.items ?? [];

  const filtered = useMemo(() => {
    return allDrivers.filter(d => {
      if (tab === 'INACTIVE') return !d.active;
      if (tab !== 'ALL' && d.status !== tab) return false;
      return true;
    });
  }, [allDrivers, tab]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const total       = allDrivers.length;
  const onlineCount = onlineDriverIds.size;
  const onRouteCount= allDrivers.filter(d => d.status === 'ON_ROUTE').length;
  const inactiveCount = allDrivers.filter(d => !d.active).length;

  // ── mutations ──────────────────────────────────────────────────────────────
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['drivers'] }); qc.invalidateQueries({ queryKey: ['drivers-online'] }); };

  const createMut = useMutation({
    mutationFn: (data: any) => driverService.create(data),
    onSuccess: () => { invalidate(); setCreateOpen(false); },
  });

  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => driverService.update(id, data),
    onSuccess: () => { invalidate(); setEditTarget(null); },
  });

  const resetMut = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => driverService.resetPassword(id, password),
    onSuccess: () => setResetTarget(null),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => driverService.setActive(id, active),
    onSuccess: () => { invalidate(); setToggleTarget(null); },
  });

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <section className='space-y-5'>

      {/* Header */}
      <div className='flex items-start justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Motoristas Operacionais</h2>
          <p className='mt-0.5 text-sm text-slate-400'>Central de gestão de motoristas • tablet / campo</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className='flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 active:scale-95 transition-all'
        >
          <Plus size={16} />
          Novo Motorista
        </button>
      </div>

      {/* KPI row */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        <KpiCard label='Total cadastrados' value={total}        icon={Users}    color='bg-slate-800 text-slate-300' />
        <KpiCard label='Online agora'      value={onlineCount} icon={Wifi}     color='bg-emerald-900 text-emerald-400' />
        <KpiCard label='Em rota'           value={onRouteCount}icon={Truck}    color='bg-cyan-900 text-cyan-400' />
        <KpiCard label='Inativos'          value={inactiveCount}icon={WifiOff} color='bg-red-900 text-red-400' />
      </div>

      {/* Filters */}
      <div className='flex flex-wrap items-center gap-3'>
        <div className='relative'>
          <Search size={14} className='absolute left-3 top-1/2 -translate-y-1/2 text-slate-500' />
          <input
            type='search'
            placeholder='Buscar por nome…'
            value={search}
            onChange={e => setSearch(e.target.value)}
            className='rounded-lg border border-border bg-slate-900 py-2 pl-8 pr-4 text-sm focus:border-cyan-700 focus:outline-none'
          />
        </div>
        <div className='flex flex-wrap gap-1'>
          {FILTER_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.key ? 'bg-cyan-700 text-white' : 'border border-border text-slate-400 hover:text-slate-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={invalidate}
          className='ml-auto rounded-lg border border-border p-2 text-slate-400 hover:text-slate-200'
          title='Atualizar'
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Table */}
      {isLoading ? <LoadingSpinner /> : (
        <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-xs uppercase tracking-wider text-slate-400'>
              <tr>
                <th className='p-3 text-left'>Motorista</th>
                <th className='p-3 text-left'>Online</th>
                <th className='p-3 text-left'>Status Op.</th>
                <th className='p-3 text-left'>Veículo</th>
                <th className='p-3 text-left'>Tablet</th>
                <th className='p-3 text-left'>Último Login</th>
                <th className='p-3 text-right'>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className='p-8 text-center text-slate-500'>
                    Nenhum motorista encontrado
                  </td>
                </tr>
              )}
              {filtered.map((d) => {
                const isOnline = onlineDriverIds.has(d.id);
                const device   = d.devices?.[0];
                const vehicleLabel = d.defaultVehicleId
                  ? vehicles.find(v => v.id === d.defaultVehicleId)?.plate ?? d.defaultVehicleId.slice(0, 8)
                  : '—';

                return (
                  <tr key={d.id} className={`border-t border-border transition-colors hover:bg-slate-900/40 ${!d.active ? 'opacity-50' : ''}`}>
                    {/* Motorista */}
                    <td className='p-3'>
                      <p className='font-medium text-slate-100'>{d.user?.name ?? '—'}</p>
                      <p className='text-xs text-slate-500'>{d.user?.email}</p>
                      {!d.active && <span className='mt-0.5 inline-block rounded bg-red-900 px-1.5 py-0.5 text-xs text-red-300'>Inativo</span>}
                    </td>

                    {/* Online status */}
                    <td className='p-3'><OnlinePulse online={isOnline} /></td>

                    {/* Operational status */}
                    <td className='p-3'><StatusBadge status={d.status} /></td>

                    {/* Vehicle */}
                    <td className='p-3'>
                      <span className='flex items-center gap-1 text-xs text-slate-300'>
                        <Truck size={12} className='text-slate-500' />
                        {vehicleLabel}
                      </span>
                    </td>

                    {/* Tablet */}
                    <td className='p-3'>
                      {device ? (
                        <div>
                          <span className='flex items-center gap-1 text-xs text-slate-300'>
                            <Smartphone size={12} className='text-slate-500' />
                            {device.name ?? device.id.slice(0, 8)}
                          </span>
                          <p className='mt-0.5 text-xs text-slate-500'>{fmtDate(device.lastSeenAt)}</p>
                        </div>
                      ) : (
                        <span className='text-xs text-slate-600'>—</span>
                      )}
                    </td>

                    {/* Last login */}
                    <td className='p-3'>
                      <span className='flex items-center gap-1 text-xs text-slate-400'>
                        <Clock size={12} className='text-slate-600' />
                        {fmtDate(d.user?.lastLoginAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className='p-3 text-right'>
                      <div className='flex items-center justify-end gap-1'>
                        <button
                          onClick={() => setEditTarget(d)}
                          title='Editar'
                          className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setResetTarget(d)}
                          title='Resetar senha'
                          className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-amber-400'
                        >
                          <KeyRound size={14} />
                        </button>
                        <button
                          onClick={() => setToggleTarget(d)}
                          title={d.active ? 'Desativar' : 'Ativar'}
                          className={`rounded-lg p-1.5 hover:bg-slate-800 ${d.active ? 'text-slate-400 hover:text-red-400' : 'text-emerald-600 hover:text-emerald-400'}`}
                        >
                          {d.active ? <PowerOff size={14} /> : <Power size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {createOpen && (
        <CreateEditModal
          driver={null}
          vehicles={vehicles}
          onClose={() => setCreateOpen(false)}
          onSave={data => createMut.mutate(data)}
          saving={createMut.isPending}
        />
      )}
      {editTarget && (
        <CreateEditModal
          driver={editTarget}
          vehicles={vehicles}
          onClose={() => setEditTarget(null)}
          onSave={data => editMut.mutate({ id: editTarget.id, data })}
          saving={editMut.isPending}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal
          driver={resetTarget}
          onClose={() => setResetTarget(null)}
          onSave={pwd => resetMut.mutate({ id: resetTarget.id, password: pwd })}
          saving={resetMut.isPending}
        />
      )}
      {toggleTarget && (
        <ConfirmToggleModal
          driver={toggleTarget}
          onClose={() => setToggleTarget(null)}
          onConfirm={() => toggleMut.mutate({ id: toggleTarget.id, active: !toggleTarget.active })}
          saving={toggleMut.isPending}
        />
      )}
    </section>
  );
}

