'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await auth.login({ email, password });
    router.push('/');
  };

  return (
    <main className='flex min-h-screen items-center justify-center bg-background'>
      <form onSubmit={onSubmit} className='w-full max-w-md rounded-xl border border-border bg-panel p-6'>
        <h1 className='mb-6 text-2xl font-semibold'>Login PRAEM OPS</h1>
        <div className='space-y-3'>
          <input
            aria-label='Email'
            type='email'
            placeholder='email@prefeitura.gov.br'
            className='w-full rounded bg-slate-900 p-3'
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            aria-label='Senha'
            type='password'
            placeholder='Digite sua senha'
            className='w-full rounded bg-slate-900 p-3'
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className='w-full rounded bg-cyan-700 p-3 font-medium'>Entrar</button>
        </div>
      </form>
    </main>
  );
}
