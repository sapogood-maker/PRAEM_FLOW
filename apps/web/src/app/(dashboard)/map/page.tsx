'use client';

import dynamic from 'next/dynamic';

const OperationalMap = dynamic(() => import('@/components/map/OperationalMap'), {
  ssr: false,
});

export default function MapPage() {
  return (
    <section className='space-y-4'>
      <h2 className='text-2xl font-semibold'>Mapa Operacional</h2>
      <OperationalMap />
    </section>
  );
}
