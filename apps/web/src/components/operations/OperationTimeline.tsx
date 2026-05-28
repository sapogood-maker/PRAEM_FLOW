'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { routeService } from '@/services/operational.service';
import { useRealtimeStore } from '@/store/realtime.store';

// ─── PT-BR event labels ───────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  DISPATCH_COMMAND_EXECUTED: 'Operação despachada',
  ROUTE_DISPATCHED: 'Rota despachada ao motorista',
  DRIVER_ACCEPTED: 'Motorista aceitou a missão',
  ROUTE_STARTED: 'Motorista iniciou a rota',
  WAITING_PATIENT: 'Motorista aguardando paciente',
  BOARDING_STARTED: 'Embarque iniciado',
  PATIENT_BOARDED: 'Paciente embarcou',
  PASSENGERS_ONBOARD: 'Todos a bordo',
  IN_TRANSIT: 'Veículo em trânsito',
  ARRIVED: 'Chegada ao destino',
  ROUTE_COMPLETED: 'Operação concluída',
  ROUTE_CANCELLED: 'Operação cancelada',
  ROUTE_FORCE_COMPLETED: 'Operação finalizada (forçado)',
  TRIP_NO_SHOW: 'Paciente não compareceu',
  TRIP_CANCELLED: 'Viagem cancelada',
  PATIENT_CONFIRMED: 'Paciente confirmou presença',
  QR_SCANNED: 'QR escaneado',
  TRIP_STOP_STATUS: 'Status de parada atualizado',
  GPS_ARRIVED_DESTINATION: 'GPS: chegada detectada',
  GPS_LEFT_ORIGIN: 'GPS: saída da origem',
};

function getEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/_/g, ' ').toLowerCase();
}

const EVENT_ICONS: Record<string, string> = {
  DISPATCH_COMMAND_EXECUTED: '⚡',
  ROUTE_DISPATCHED: '📡',
  DRIVER_ACCEPTED: '✅',
  ROUTE_STARTED: '🚗',
  PATIENT_CONFIRMED: '✅',
  BOARDING_STARTED: '🚪',
  PATIENT_BOARDED: '🧑',
  PASSENGERS_ONBOARD: '👥',
  IN_TRANSIT: '🛣️',
  ARRIVED: '🏥',
  ROUTE_COMPLETED: '🏁',
  ROUTE_CANCELLED: '❌',
  TRIP_NO_SHOW: '⚠️',
  QR_SCANNED: '📷',
  GPS_ARRIVED_DESTINATION: '📍',
};

function getEventIcon(eventType: string): string {
  return EVENT_ICONS[eventType] ?? '•';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  eventType: string;
  fromState: string | null;
  toState: string | null;
  source: string | null;
  patientId: string | null;
  patientName: string | null;
  driverId: string | null;
  vehicleId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Props {
  routeId: string;
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OperationTimeline({ routeId, compact = false }: Props) {
  const qc = useQueryClient();
  const revision = useRealtimeStore((s) => s.revision);

  const { data: events = [], isLoading } = useQuery<TimelineEvent[]>({
    queryKey: ['route-timeline', routeId],
    queryFn: () => routeService.getTimeline(routeId),
    refetchInterval: 15_000,
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['route-timeline', routeId] });
  }, [revision, qc, routeId]);

  if (isLoading) {
    return <div className='text-xs text-slate-500 py-2'>Carregando timeline…</div>;
  }

  if (events.length === 0) {
    return <div className='text-xs text-slate-500 py-2'>Sem eventos registrados ainda.</div>;
  }

  return (
    <div className='space-y-0'>
      {events.map((event, idx) => {
        const date = new Date(event.createdAt);
        const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const isLast = idx === events.length - 1;

        return (
          <div key={event.id} className='flex gap-3'>
            {/* Timeline spine */}
            <div className='flex flex-col items-center'>
              <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-sm'>
                {getEventIcon(event.eventType)}
              </div>
              {!isLast && <div className='w-px flex-1 bg-slate-700/60 my-0.5' />}
            </div>

            {/* Content */}
            <div className={`pb-3 min-w-0 flex-1 ${isLast ? '' : ''}`}>
              <div className='flex flex-wrap items-baseline gap-2'>
                <span className='text-xs font-mono text-slate-500 shrink-0'>
                  {compact ? timeStr : `${dateStr} ${timeStr}`}
                </span>
                <span className='text-sm text-slate-200 font-medium'>
                  {getEventLabel(event.eventType)}
                </span>
              </div>

              {!compact && (
                <div className='mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-400'>
                  {event.patientName && (
                    <span className='rounded bg-slate-800 px-1.5 py-0.5'>
                      👤 {event.patientName}
                    </span>
                  )}
                  {event.fromState && event.toState && (
                    <span className='rounded bg-slate-800 px-1.5 py-0.5 font-mono'>
                      {event.fromState} → {event.toState}
                    </span>
                  )}
                  {event.source && (
                    <span className='rounded bg-slate-800/60 px-1.5 py-0.5 text-slate-500'>
                      via {event.source}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
