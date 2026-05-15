import type { Metadata } from 'next';
import './globals.css';
import { isValidElement } from 'react';

export const metadata: Metadata = {
  title: 'PRAEM OPS',
  description: 'Central Operacional Logística do Transporte SUS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isSlotObject =
    typeof children === 'object' &&
    children !== null &&
    !isValidElement(children) &&
    !Array.isArray(children) &&
    !(children instanceof Promise);

  const normalizedChildren =
    isSlotObject ? Object.values(children as unknown as Record<string, React.ReactNode>) : children;

  return (
    <html lang='pt-BR'>
      <body className='font-sans'>{normalizedChildren}</body>
    </html>
  );
}
