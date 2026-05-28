'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type TokenInfo = {
  type: string;
  patient: { name: string };
  trip: {
    route: {
      origin: string;
      destination: string;
      date: string;
      scheduledAt: string | null;
    };
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3010';

export default function TokenPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;

  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/trip-tokens/${token}/info`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      })
      .then((data) => setInfo(data))
      .catch((e) => setError(e?.message ?? 'Token inválido ou expirado.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function confirmPresence() {
    if (!token) return;
    setConfirming(true);
    try {
      const response = await fetch(`${API_BASE}/trip-tokens/${token}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body?.message ?? 'Não foi possível confirmar.');
      }
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Não foi possível confirmar.');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-900 text-slate-400'>
        Carregando...
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-900 p-4'>
        <div className='w-full max-w-md rounded-2xl border border-red-900/50 bg-slate-800 p-6 text-center'>
          <h1 className='text-xl font-bold text-red-300'>Link inválido</h1>
          <p className='mt-2 text-sm text-slate-400'>{error}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  const fullName = info.patient.name ?? '';
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName;
  const operationDateRef = info.trip.route.scheduledAt ?? info.trip.route.date;
  const dateLabel = new Date(operationDateRef).toLocaleDateString('pt-BR');
  const timeLabel = new Date(operationDateRef).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (done) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-900 p-4'>
        <div className='w-full max-w-md rounded-2xl border border-emerald-900/50 bg-slate-800 p-6 text-center'>
          <div className='text-5xl'>✅</div>
          <h1 className='mt-3 text-2xl font-bold text-emerald-300'>Presença confirmada</h1>
          <p className='mt-2 text-sm text-slate-400'>
            Obrigado, {firstName}. O status da operação foi atualizado para <strong>CONFIRMED</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-slate-900 p-4'>
      <div className='w-full max-w-md space-y-4'>
        <div className='text-center'>
          <h1 className='text-2xl font-bold text-cyan-300'>PRAEM OPS</h1>
          <p className='text-xs text-slate-500'>Confirmação de presença</p>
        </div>

        <div className='space-y-4 rounded-2xl border border-slate-700 bg-slate-800 p-6'>
          <div>
            <p className='text-xs uppercase tracking-wider text-slate-500'>Paciente</p>
            <p className='text-lg font-semibold text-slate-100'>{firstName}</p>
          </div>
          <div>
            <p className='text-xs uppercase tracking-wider text-slate-500'>Data</p>
            <p className='text-sm text-slate-200'>{dateLabel}</p>
          </div>
          <div>
            <p className='text-xs uppercase tracking-wider text-slate-500'>Horário</p>
            <p className='text-sm text-slate-200'>{timeLabel}</p>
          </div>
          <div>
            <p className='text-xs uppercase tracking-wider text-slate-500'>Saída</p>
            <p className='text-sm text-slate-200'>{info.trip.route.origin}</p>
          </div>
          <div>
            <p className='text-xs uppercase tracking-wider text-slate-500'>Destino</p>
            <p className='text-sm text-slate-200'>{info.trip.route.destination}</p>
          </div>
        </div>

        <button
          onClick={confirmPresence}
          disabled={confirming}
          className='w-full rounded-xl bg-cyan-700 px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50'
        >
          {confirming ? 'Confirmando...' : 'Confirmar presença'}
        </button>
      </div>
    </div>
  );
}

