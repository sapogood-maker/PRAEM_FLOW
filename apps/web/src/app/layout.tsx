import type { Metadata } from 'next';
import './globals.css';
import { normalizeChildren } from '@/lib/normalize-children';

export const metadata: Metadata = {
  title: 'PRAEM OPS',
  description: 'Central Operacional Logística do Transporte SUS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const normalizedChildren = normalizeChildren(children);

  return (
    <html lang='pt-BR'>
      <body className='font-sans'>{normalizedChildren}</body>
    </html>
  );
}
