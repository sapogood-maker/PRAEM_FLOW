import { Injectable } from '@nestjs/common';

export interface NormalizedSusRow {
  patientName: string;
  cpf: string;
  appointmentDate: string;
  destination: string;
  queueType: 'LOGISTICS' | 'MEDICAL';
  priority: 'EMERGENCY' | 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'PENDING';
  notes?: string;
}

function pick(raw: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim().length > 0) return String(value).trim();
  }
  return '';
}

function normalizePriority(value: string): NormalizedSusRow['priority'] {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (['EMERGENCY', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'PENDING'].includes(normalized)) {
    return normalized as NormalizedSusRow['priority'];
  }
  return 'NORMAL';
}

@Injectable()
export class SusImportRowMapper {
  map(raw: Record<string, string>): NormalizedSusRow {
    const queueTypeRaw = pick(raw, ['queue_type', 'tipo_fila']).toUpperCase();
    const queueType: NormalizedSusRow['queueType'] =
      queueTypeRaw === 'MEDICAL' ? 'MEDICAL' : 'LOGISTICS';

    const appointmentRaw = pick(raw, ['appointment_date', 'data_consulta', 'consulta_em']);
    const appointmentDate = new Date(appointmentRaw);

    return {
      patientName: pick(raw, ['patient_name', 'nome_paciente', 'nome']),
      cpf: pick(raw, ['cpf', 'documento']).replace(/\D/g, ''),
      appointmentDate: Number.isNaN(appointmentDate.getTime()) ? '' : appointmentDate.toISOString(),
      destination: pick(raw, ['destination', 'destino', 'hospital', 'unidade']),
      queueType,
      priority: normalizePriority(pick(raw, ['priority', 'prioridade'])),
      notes: pick(raw, ['notes', 'observacoes']) || undefined,
    };
  }
}

