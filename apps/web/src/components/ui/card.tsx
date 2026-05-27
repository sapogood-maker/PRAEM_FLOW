import { PropsWithChildren } from 'react';

export function Card({ children }: PropsWithChildren) {
  return <div className='rounded-2xl border border-white/5 bg-slate-950/70 p-4 shadow-2xl backdrop-blur-xl'>{children}</div>;
}
