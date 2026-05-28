import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface NormalizedSusRow {
  patient_name: string;
  cpf: string;
  phone?: string;
  origin_city: string;
  destination_hospital: string;
  destination_address: string;
  appointment_date: string;
  appointment_time: string;
  appointment_at: string;
  notes?: string;
  priority: 'EMERGENCY' | 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW' | 'PENDING';
  companion: boolean;
  return_trip: boolean;
  special_requirements?: string;
}

function pick(raw: Record<string, string>, key: string): string {
  const value = raw[key];
  return value == null ? '' : String(value).trim();
}

function normalizePriority(value: string): NormalizedSusRow['priority'] {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (['EMERGENCY', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'PENDING'].includes(normalized)) {
    return normalized as NormalizedSusRow['priority'];
  }
  return 'NORMAL';
}

function buildSyntheticCpf(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  const digits = hash.replace(/[a-f]/gi, '').padEnd(10, '0').slice(0, 10);
  return `9${digits}`;
}

@Injectable()
export class SusImportRowMapper {
  map(raw: Record<string, string>): NormalizedSusRow {
    const today = new Date();
    const fallbackDate = today.toISOString().slice(0, 10);
    const appointmentDate = this.normalizeDate(pick(raw, 'appointment_date')) || fallbackDate;
    const appointmentTime = this.normalizeTime(pick(raw, 'appointment_time')) || '08:00';
    const appointmentAt = appointmentDate && appointmentTime
      ? new Date(`${appointmentDate}T${appointmentTime}:00`)
      : null;

    const phone = pick(raw, 'phone').replace(/[^\d()+\-\s]/g, '') || undefined;
    const notes = pick(raw, 'notes') || undefined;
    const specialRequirements = pick(raw, 'special_requirements') || undefined;
    const patientName = pick(raw, 'patient_name');
    const destinationHospital = pick(raw, 'destination_hospital');
    const cpfRaw = pick(raw, 'cpf').replace(/\D/g, '');
    const cpf = cpfRaw.length === 11 ? cpfRaw : buildSyntheticCpf(`${patientName}|${phone ?? ''}|${destinationHospital}`);

    return {
      patient_name: patientName,
      cpf,
      phone,
      origin_city: pick(raw, 'origin_city') || 'Sem origem informada',
      destination_hospital: destinationHospital,
      destination_address: pick(raw, 'destination_address') || destinationHospital,
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      appointment_at: appointmentAt && !Number.isNaN(appointmentAt.getTime()) ? appointmentAt.toISOString() : new Date(`${appointmentDate}T08:00:00`).toISOString(),
      notes,
      priority: normalizePriority(pick(raw, 'priority')),
      companion: this.toBoolean(pick(raw, 'companion')),
      return_trip: this.toBoolean(pick(raw, 'return_trip')),
      special_requirements: specialRequirements,
    };
  }

  private toBoolean(value: string): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'sim', 's'].includes(normalized);
  }

  private normalizeDate(value: string): string | null {
    const trimmed = value.trim();
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }

  private normalizeTime(value: string): string | null {
    const trimmed = value.trim();
    const hhmm = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
    if (!hhmm) return null;
    return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
  }
}
