import { Injectable } from '@nestjs/common';

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

@Injectable()
export class SusImportRowMapper {
  map(raw: Record<string, string>): NormalizedSusRow {
    const appointmentDate = this.normalizeDate(pick(raw, 'appointment_date')) || '';
    const appointmentTime = this.normalizeTime(pick(raw, 'appointment_time')) || '';
    const appointmentAt = appointmentDate && appointmentTime
      ? new Date(`${appointmentDate}T${appointmentTime}:00`)
      : null;

    const phone = pick(raw, 'phone').replace(/[^\d()+\-\s]/g, '') || undefined;
    const notes = pick(raw, 'notes') || undefined;
    const specialRequirements = pick(raw, 'special_requirements') || undefined;

    return {
      patient_name: pick(raw, 'patient_name'),
      cpf: pick(raw, 'cpf').replace(/\D/g, ''),
      phone,
      origin_city: pick(raw, 'origin_city'),
      destination_hospital: pick(raw, 'destination_hospital'),
      destination_address: pick(raw, 'destination_address'),
      appointment_date: appointmentDate,
      appointment_time: appointmentTime,
      appointment_at: appointmentAt && !Number.isNaN(appointmentAt.getTime()) ? appointmentAt.toISOString() : '',
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
