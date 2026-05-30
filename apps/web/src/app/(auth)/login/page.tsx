'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await auth.login({ email, password });
      router.push('/');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Credenciais inválidas. Verifique e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className='flex min-h-screen items-center justify-center bg-background'>
      <div className='w-full max-w-md'>
        {/* Brand header */}
        <div className='mb-8 text-center'>
          <p className='text-xs uppercase tracking-[0.2em] text-cyan-400'>Sistema de Transporte SUS</p>
          <h1 className='mt-1 text-3xl font-bold text-slate-100'>PRAEM OPS</h1>
          <p className='mt-1 text-sm text-slate-500'>Central Operacional Logística</p>
        </div>

        <form onSubmit={onSubmit} className='rounded-xl border border-border bg-panel p-8 space-y-4'>
          {error && (
            <div role='alert' className='rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300'>
              {error}
            </div>
          )}
          <div className='space-y-1'>
            <label htmlFor='email' className='text-xs text-slate-400 uppercase tracking-wider'>Email</label>
            <input
              id='email'
              type='email'
              placeholder='admin@praem.local'
              autoComplete='email'
              className='w-full rounded-lg bg-slate-900 border border-border px-4 py-3 text-sm placeholder-slate-600 focus:border-cyan-700 focus:outline-none'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className='space-y-1'>
            <label htmlFor='password' className='text-xs text-slate-400 uppercase tracking-wider'>Senha</label>
            <input
              id='password'
              type='password'
              placeholder='••••••••'
              autoComplete='current-password'
              className='w-full rounded-lg bg-slate-900 border border-border px-4 py-3 text-sm placeholder-slate-600 focus:border-cyan-700 focus:outline-none'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <button
            type='submit'
            disabled={loading}
            className='w-full rounded-lg bg-cyan-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {loading ? 'Entrando…' : 'Entrar no Sistema'}
          </button>
          <p className='text-center text-xs text-slate-600'>admin@praem.local · Admin@123</p>
        </form>
      </div>
    </main>
  );
}

