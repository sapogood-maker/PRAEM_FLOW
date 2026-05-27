import { Injectable } from '@nestjs/common';
import { SUS_IMPORT_COLUMNS } from '../parsers/sus-spreadsheet.parser';

export interface SusRowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SusRowValidationContext {
  lineNumber: number;
  seenRowKeys: Set<string>;
}

@Injectable()
export class SusImportRowValidator {
  validate(raw: Record<string, string>, context: SusRowValidationContext): SusRowValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const patientName = this.pick(raw, 'patient_name');
    const cpf = this.pick(raw, 'cpf');
    const phone = this.pick(raw, 'phone');
    const originCity = this.pick(raw, 'origin_city');
    const destinationHospital = this.pick(raw, 'destination_hospital');
    const destinationAddress = this.pick(raw, 'destination_address');
    const appointmentDate = this.pick(raw, 'appointment_date');
    const appointmentTime = this.pick(raw, 'appointment_time');
    const priority = this.pick(raw, 'priority').toUpperCase();
    const companion = this.pick(raw, 'companion');
    const returnTrip = this.pick(raw, 'return_trip');

    const populatedFields = SUS_IMPORT_COLUMNS.filter((column) => this.pick(raw, column).length > 0).length;
    if (populatedFields < 3) {
      errors.push('MALFORMED_ROW: row has insufficient mapped fields');
    }

    if (!patientName) errors.push('REQUIRED_FIELD: patient_name is required');
    if (!cpf) errors.push('REQUIRED_FIELD: cpf is required');
    if (!originCity) errors.push('REQUIRED_FIELD: origin_city is required');
    if (!destinationHospital) errors.push('REQUIRED_FIELD: destination_hospital is required');
    if (!destinationAddress) errors.push('REQUIRED_FIELD: destination_address is required');
    if (!appointmentDate) errors.push('REQUIRED_FIELD: appointment_date is required');
    if (!appointmentTime) errors.push('REQUIRED_FIELD: appointment_time is required');
    if (!priority) errors.push('REQUIRED_FIELD: priority is required');

    const cpfDigits = cpf.replace(/\D/g, '');
    if (cpf && cpfDigits.length !== 11) {
      errors.push('MALFORMED_CPF: cpf must contain 11 digits');
    }

    if (phone) {
      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length > 0 && phoneDigits.length < 10) {
        warnings.push('PHONE_WARNING: phone number appears too short');
      }
    }

    const allowedPriorities = ['EMERGENCY', 'CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'PENDING'];
    if (priority && !allowedPriorities.includes(priority)) {
      warnings.push('PRIORITY_WARNING: unknown priority, NORMAL fallback will be applied');
    }

    if (!this.isBooleanLike(companion)) {
      warnings.push('COMPANION_WARNING: value should be yes/no (fallback false)');
    }
    if (!this.isBooleanLike(returnTrip)) {
      warnings.push('RETURN_TRIP_WARNING: value should be yes/no (fallback false)');
    }

    const appointmentAt = this.parseAppointment(appointmentDate, appointmentTime);
    if (!appointmentAt) {
      errors.push('INVALID_DATE: appointment_date/appointment_time is invalid');
    }

    if (appointmentAt) {
      const duplicateKey = [
        cpfDigits,
        appointmentAt.toISOString(),
        originCity.toUpperCase(),
        destinationHospital.toUpperCase(),
      ].join('|');
      if (context.seenRowKeys.has(duplicateKey)) {
        errors.push('DUPLICATE_ROW: duplicated patient schedule row');
      } else {
        context.seenRowKeys.add(duplicateKey);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private pick(raw: Record<string, string>, key: string): string {
    const value = raw[key];
    return value == null ? '' : String(value).trim();
  }

  private isBooleanLike(value: string): boolean {
    if (!value) return true;
    const normalized = value.trim().toLowerCase();
    return ['1', '0', 'true', 'false', 'yes', 'no', 'y', 'n', 'sim', 'nao', 'não'].includes(normalized);
  }

  private parseAppointment(dateRaw: string, timeRaw: string): Date | null {
    if (!dateRaw || !timeRaw) return null;
    const normalizedDate = this.normalizeDate(dateRaw);
    const normalizedTime = this.normalizeTime(timeRaw);
    if (!normalizedDate || !normalizedTime) return null;
    const date = new Date(`${normalizedDate}T${normalizedTime}:00`);
    return Number.isNaN(date.getTime()) ? null : date;
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
    if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`;
    return null;
  }
}
