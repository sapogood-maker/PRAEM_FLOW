import { Injectable } from '@nestjs/common';

export interface SusRowValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function pick(raw: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim().length > 0) return String(value).trim();
  }
  return '';
}

@Injectable()
export class SusImportRowValidator {
  validate(raw: Record<string, string>): SusRowValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const patientName = pick(raw, ['patient_name', 'nome_paciente', 'nome']);
    const cpf = pick(raw, ['cpf', 'documento']);
    const appointmentDate = pick(raw, ['appointment_date', 'data_consulta', 'consulta_em']);
    const destination = pick(raw, ['destination', 'destino', 'hospital', 'unidade']);

    if (!patientName) errors.push('patient_name is required');
    if (!cpf) errors.push('cpf is required');
    if (!appointmentDate) errors.push('appointment_date is required');
    if (!destination) errors.push('destination is required');

    const cpfDigits = cpf.replace(/\D/g, '');
    if (cpf && cpfDigits.length !== 11) {
      errors.push('cpf must contain 11 digits');
    }

    const date = appointmentDate ? new Date(appointmentDate) : null;
    if (appointmentDate && (!date || Number.isNaN(date.getTime()))) {
      errors.push('appointment_date is invalid');
    }

    const queueType = pick(raw, ['queue_type', 'tipo_fila']).toUpperCase();
    if (queueType && !['LOGISTICS', 'MEDICAL'].includes(queueType)) {
      warnings.push('queue_type not recognized; fallback will be applied');
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

