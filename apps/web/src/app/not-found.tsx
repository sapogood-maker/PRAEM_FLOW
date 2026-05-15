export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <main className='flex min-h-screen items-center justify-center bg-background text-slate-100'>
      <div className='rounded-xl border border-border bg-panel p-6'>
        <h1 className='text-2xl font-semibold'>Página não encontrada</h1>
      </div>
    </main>
  );
}
