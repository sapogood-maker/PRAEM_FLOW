import { PropsWithChildren } from 'react';

export function DataTable({ children }: PropsWithChildren) {
  return <div className='overflow-hidden rounded-xl border border-border bg-panel'>{children}</div>;
}
