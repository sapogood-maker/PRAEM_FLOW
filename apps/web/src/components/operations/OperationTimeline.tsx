'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { routeService } from '@/services/operational.service';
import { useRealtimeStore } from '@/store/realtime.store';

// ─── PT-BR event labels ───────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  OPERATION_IMPORTED: 'Operação importada',
  SPREADSHEET_IMPORTED: 'Planilha importada',
  SUS_IMPORT_UPLOADED: 'Arquivo SUS importado',
  OPERATION_CREATED: 'Operação criada',
  OPERATION_DISPATCHED: 'Operação despachada',
  DRIVER_ASSIGNED: 'Motorista atribuído',
  VEHICLE_ASSIGNED: 'Veículo atribuído',
  PATIENT_CONFIRMED: 'Paciente confirmado',
  PATIENT_CONFIRMATION_UPDATED: 'Confirmação atualizada',
  QR_GENERATED: 'QR gerado',
  QR_SCANNED: 'QR escaneado',
  QUEUE_CREATED: 'Paciente na fila',
  QUEUE_NO_SHOW: 'No-show na fila',
  QUEUE_STATUS_CONFIRMED: 'Fila confirmada',
  OPERATION_DELAYED: 'Operação atrasada',
  OPERATION_CRITICAL_DELAY: 'Atraso crítico',
  VEHICLE_OFFLINE: 'Veículo offline',
  GPS_CHECKPOINT: 'Ponto GPS',
  ARRIVED: 'Chegada ao destino',
  COMPLETED: 'Operação concluída',
  CANCELLED: 'Operação cancelada',
  BOARDING: 'Embarque',
  IN_TRANSIT: 'Em trânsito',
  CONFIRMED: 'Confirmado',
};

function getEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/_/g, ' ').toLowerCase();
}

const EVENT_ICONS: Record<string, string> = {
  OPERATION_IMPORTED: '📥',
  SPREADSHEET_IMPORTED: '📥',
  SUS_IMPORT_UPLOADED: '🗂️',
  OPERATION_CREATED: '✨',
  OPERATION_DISPATCHED: '⚡',
  DRIVER_ASSIGNED: '👤',
  VEHICLE_ASSIGNED: '🚐',
  PATIENT_CONFIRMED: '✅',
  QR_GENERATED: '📷',
  QR_SCANNED: '📷',
  QUEUE_CREATED: '🧾',
  OPERATION_DELAYED: '⏱️',
  OPERATION_CRITICAL_DELAY: '🚨',
  VEHICLE_OFFLINE: '📴',
  GPS_CHECKPOINT: '📍',
  ARRIVED: '🏥',
  COMPLETED: '🏁',
  CANCELLED: '❌',
  BOARDING: '🚪',
  IN_TRANSIT: '🛣️',
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
