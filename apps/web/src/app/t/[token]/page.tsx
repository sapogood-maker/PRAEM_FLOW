'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

type TokenInfo = {
  id: string;
  type: string;
  expiresAt: string;
  patient: { name: string };
  trip: {
    id: string;
    status: string;
    route: {
      origin: string;
      destination: string;
      date: string;
      scheduledAt: string | null;
    };
  };
};

const TYPE_LABEL: Record<string, string> = {
  CONFIRMATION: 'Confirmar Viagem',
  BOARDING:     'Confirmar Embarque',
  RETURN:       'Solicitar Retorno',
  REBOOK:       'Reagendar Viagem',
};

const TYPE_DESCRIPTION: Record<string, string> = {
  CONFIRMATION: 'Por favor, confirme sua presença para a viagem abaixo.',
  BOARDING:     'O motorista está aguardando. Confirme seu embarque.',
  RETURN:       'Solicite o transporte de retorno quando estiver pronto.',
  REBOOK:       'Solicite o reagendamento desta viagem.',
};

const TYPE_BUTTON_COLOR: Record<string, string> = {
  CONFIRMATION: 'bg-blue-600 hover:bg-blue-700',
  BOARDING:     'bg-slate-600',
  RETURN:       'bg-cyan-600 hover:bg-cyan-700',
  REBOOK:       'bg-amber-600 hover:bg-amber-700',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3010';

export default function TokenPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;

  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [acting, setActing] = useState(false);

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

  async function handleAction() {
    if (!token) return;
    setActing(true);
    try {
      const res = await fetch(`${API_BASE}/trip-tokens/${token}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e?.message ?? 'Erro ao processar solicitação.');
      }
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao processar solicitação.');
    } finally {
      setActing(false);
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });

  if (loading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-900'>
        <div className='text-slate-400'>Carregando…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-900 p-4'>
        <div className='w-full max-w-md rounded-xl border border-red-700 bg-slate-800 p-6 text-center'>
          <div className='mb-3 text-4xl'>⚠️</div>
          <h1 className='mb-2 text-xl font-bold text-red-400'>Token Inválido</h1>
          <p className='text-sm text-slate-400'>{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-slate-900 p-4'>
        <div className='w-full max-w-md rounded-xl border border-emerald-700 bg-slate-800 p-6 text-center'>
          <div className='mb-3 text-5xl'>✅</div>
          <h1 className='mb-2 text-xl font-bold text-emerald-400'>Confirmado!</h1>
          <p className='text-sm text-slate-400'>
            Sua solicitação foi registrada com sucesso. O operador será notificado.
          </p>
        </div>
      </div>
    );
  }

  if (!info) return null;

  const route = info.trip.route;
  const tripDate = route.scheduledAt ?? route.date;
  const label = TYPE_LABEL[info.type] ?? info.type;
  const description = TYPE_DESCRIPTION[info.type] ?? '';
  const btnColor = TYPE_BUTTON_COLOR[info.type] ?? 'bg-blue-600 hover:bg-blue-700';
  const boardingDisabled = info.type === 'BOARDING';

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-slate-900 p-4'>
      <div className='w-full max-w-md space-y-4'>
        {/* Logo / Marca */}
        <div className='text-center'>
          <h1 className='text-2xl font-bold text-blue-400'>PRAEM OPS</h1>
          <p className='text-xs text-slate-500'>Central de Transporte SUS</p>
        </div>

        {/* Card principal */}
        <div className='rounded-xl border border-slate-700 bg-slate-800 p-6 space-y-4'>
          <div>
            <p className='text-xs text-slate-500 uppercase tracking-wide'>Paciente</p>
            <p className='text-lg font-semibold text-slate-100'>{info.patient.name}</p>
          </div>

          <div>
            <p className='text-xs text-slate-500 uppercase tracking-wide'>Viagem</p>
            <p className='text-sm text-slate-300'>
              {route.origin} → {route.destination}
            </p>
            <p className='text-sm text-slate-400'>{formatDate(tripDate)}</p>
          </div>

          <div className='rounded-lg border border-slate-600 bg-slate-700/50 p-3'>
            <p className='text-sm text-slate-300'>{description}</p>
          </div>

          <div className='text-xs text-slate-500'>
            Válido até: {formatDate(info.expiresAt)}
          </div>
        </div>

        {/* Botão de ação */}
        <button
          onClick={boardingDisabled ? undefined : handleAction}
          disabled={acting || boardingDisabled}
          className={`w-full rounded-xl py-3 text-base font-semibold text-white transition-colors disabled:opacity-50 ${btnColor}`}
        >
          {boardingDisabled ? 'Embarque somente pelo app do motorista' : acting ? 'Processando…' : label}
        </button>
      </div>
    </div>
  );
}
