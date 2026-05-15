'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { driverService } from '@/services/operational.service';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: 'bg-emerald-900 text-emerald-300',
  ON_ROUTE: 'bg-cyan-900 text-cyan-300',
  REST: 'bg-amber-900 text-amber-300',
  OFFLINE: 'bg-slate-800 text-slate-400',
};

export default function DriversPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', search],
    queryFn: () => driverService.list({ search, limit: 50 }),
  });

  const items = data?.items ?? [];

  return (
    <section className='space-y-4'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold text-slate-100'>Motoristas</h2>
          <p className='text-sm text-slate-400'>{data?.total ?? 0} motorista(s) cadastrado(s)</p>
        </div>
      </div>

      <input
        type='search'
        placeholder='Buscar por nome…'
        className='w-full max-w-sm rounded-lg border border-border bg-slate-900 px-4 py-2 text-sm focus:border-cyan-700 focus:outline-none'
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? <LoadingSpinner /> : (
        <div className='overflow-x-auto rounded-xl border border-border bg-panel'>
          <table className='w-full text-sm'>
            <thead className='bg-slate-900 text-xs text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 text-left'>Nome</th>
                <th className='p-3 text-left'>CNH</th>
                <th className='p-3 text-left'>Validade CNH</th>
                <th className='p-3 text-left'>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className='p-6 text-center text-slate-500'>Nenhum motorista cadastrado</td></tr>
              )}
              {items.map((d: any) => (
                <tr key={d.id} className='border-t border-border hover:bg-slate-900/40 transition-colors'>
                  <td className='p-3 font-medium'>{d.user?.name ?? '—'}</td>
                  <td className='p-3 font-mono text-xs'>{d.cnh}</td>
                  <td className='p-3 text-xs'>{d.cnhExpiry ? new Date(d.cnhExpiry).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className='p-3'>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[d.status] ?? 'text-slate-400'}`}>{d.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

