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
      driver?: { user: { name: string } } | null;
    };
  };
  boardingQrToken?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3010';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-start justify-between gap-2 py-2 border-b border-slate-700/50 last:border-0'>
      <span className='text-xs uppercase tracking-wider text-slate-500 shrink-0 pt-0.5'>{label}</span>
      <span className='text-sm text-slate-100 text-right font-medium'>{value}</span>
    </div>
  );
}

export default function TokenPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/trip-tokens/${token}/info`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).message ?? 'Token inválido');
        return r.json() as Promise<TokenInfo>;
      })
      .then(setInfo)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function confirmPresence() {
    setConfirming(true);
    try {
      const res = await fetch(`${API_BASE}/trip-tokens/${token}/use`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).message ?? 'Erro ao confirmar');
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-950 text-slate-400'>
        <div className='text-center space-y-3'>
          <div className='text-3xl animate-pulse'>🚑</div>
          <p className='text-sm'>Carregando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-950 p-4'>
        <div className='w-full max-w-sm rounded-2xl border border-red-900/50 bg-slate-900 p-6 text-center space-y-3'>
          <div className='text-4xl'>❌</div>
          <h1 className='text-xl font-bold text-red-300'>Link inválido</h1>
          <p className='text-sm text-slate-400'>{error}</p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  const fullName = info.patient.name ?? '';
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName;
  const operationDateRef = info.trip.route.scheduledAt ?? info.trip.route.date;
  const dateLabel = new Date(operationDateRef).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  });
  const timeLabel = new Date(operationDateRef).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit',
  });
  const driverFirstName = info.trip.route.driver?.user?.name?.split(/\s+/)[0];
  const isConfirmationType = info.type === 'CONFIRMATION';

  if (done) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-950 p-4'>
        <div className='w-full max-w-sm rounded-2xl border border-emerald-900/50 bg-slate-900 p-8 text-center space-y-4'>
          <div className='text-5xl'>✅</div>
          <h1 className='text-2xl font-bold text-emerald-300'>Presença confirmada!</h1>
          <p className='text-sm text-slate-300'>
            Obrigado, <strong>{firstName}</strong>. Sua presença foi registrada.
          </p>
          <div className='rounded-xl bg-slate-800 p-4 text-left space-y-1 text-sm text-slate-300'>
            <p>📅 <strong>{dateLabel}</strong></p>
            <p>⏰ Horário: <strong>{timeLabel}</strong></p>
            <p>📍 Saída: {info.trip.route.origin}</p>
            <p>🏥 Destino: {info.trip.route.destination}</p>
            {driverFirstName && <p>🚗 Motorista: {driverFirstName}</p>}
          </div>
          <p className='text-xs text-slate-500'>
            Esteja no local de embarque com <strong>15 minutos de antecedência</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-slate-950 p-4'>
      <div className='w-full max-w-sm space-y-4'>
        {/* Header */}
        <div className='text-center space-y-1'>
          <div className='text-3xl'>🚑</div>
          <h1 className='text-2xl font-bold text-cyan-400'>PRAEM OPS</h1>
          <p className='text-xs text-slate-500 uppercase tracking-wider'>
            {isConfirmationType ? 'Confirmação de presença' : 'Embarque'}
          </p>
        </div>

        {/* Greeting */}
        <div className='rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4'>
          <p className='text-sm text-slate-400'>Olá,</p>
          <p className='text-xl font-bold text-slate-100'>{firstName} 👋</p>
        </div>

        {/* Operation info */}
        <div className='rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 space-y-0'>
          <InfoRow label='Data' value={dateLabel} />
          <InfoRow label='Horário' value={timeLabel} />
          <InfoRow label='Saída' value={info.trip.route.origin} />
          <InfoRow label='Destino' value={info.trip.route.destination} />
          {driverFirstName && <InfoRow label='Motorista' value={driverFirstName} />}
        </div>

        {/* QR code for boarding token */}
        {info.boardingQrToken && (
          <div className='rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-center space-y-2'>
            <p className='text-xs uppercase tracking-wider text-slate-500'>QR Code de embarque</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${API_BASE}/qr-engine/image/${info.boardingQrToken}`}
              alt='QR Code de embarque'
              className='mx-auto h-40 w-40 rounded-xl'
            />
            <p className='text-xs text-slate-500'>
              Apresente ao motorista no momento do embarque
            </p>
          </div>
        )}

        {/* CTA */}
        {isConfirmationType && (
          <>
            <button
              onClick={confirmPresence}
              disabled={confirming}
              className='w-full rounded-xl bg-cyan-600 px-4 py-4 text-base font-bold text-white transition-all hover:bg-cyan-500 active:scale-95 disabled:opacity-50'
            >
              {confirming ? 'Confirmando...' : '✅ Confirmar presença'}
            </button>
            <p className='text-center text-xs text-slate-600'>
              Ao confirmar você informa ao despachante que estará presente na operação.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
