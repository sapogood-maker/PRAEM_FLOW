import { PropsWithChildren } from 'react';

export function Card({ children }: PropsWithChildren) {
  return <div className='rounded-xl border border-border bg-panel p-4 shadow-lg'>{children}</div>;
}
