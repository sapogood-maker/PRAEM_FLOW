'use client';

export default function DailyOpPage() {
  return (
    <section className='space-y-6'>
      <div>
        <h2 className='text-2xl font-bold text-slate-100'>Operação do Dia</h2>
        <p className='text-sm text-slate-400'>Controle diário de turnos, veículos e equipe</p>
      </div>

      {/* Status banner */}
      <div className='rounded-xl border border-cyan-700 bg-cyan-950/40 p-4'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='text-xs uppercase tracking-wider text-cyan-400'>Operação Atual</p>
            <p className='text-lg font-bold text-slate-100'>{new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <span className='rounded-full bg-cyan-700 px-4 py-1 text-sm font-medium text-white'>PLANEJANDO</span>
        </div>
      </div>

      {/* Shifts */}
      <div>
        <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'>Turnos</h3>
        <div className='grid gap-3 md:grid-cols-3'>
          {[
            { name: 'Manhã', start: '06:00', end: '12:00', status: 'PENDING' },
            { name: 'Tarde', start: '12:00', end: '18:00', status: 'PENDING' },
            { name: 'Noite', start: '18:00', end: '23:00', status: 'PENDING' },
          ].map((shift) => (
            <div key={shift.name} className='rounded-xl border border-border bg-panel p-4'>
              <p className='font-semibold'>{shift.name}</p>
              <p className='text-sm text-slate-400'>{shift.start} – {shift.end}</p>
              <span className='mt-2 inline-block rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400'>
                {shift.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className='rounded-xl border border-border bg-panel p-4'>
        <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400'>Resumo da Operação</h3>
        <div className='grid gap-4 grid-cols-2 md:grid-cols-4 text-center'>
          {[
            { label: 'Veículos', value: '0' },
            { label: 'Motoristas', value: '0' },
            { label: 'Pacientes', value: '0' },
            { label: 'Rotas', value: '0' },
          ].map((s) => (
            <div key={s.label}>
              <p className='text-2xl font-bold text-cyan-400'>{s.value}</p>
              <p className='text-xs text-slate-400'>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
