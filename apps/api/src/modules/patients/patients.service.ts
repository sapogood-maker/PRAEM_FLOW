import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

type Patient = {
  id: string;
  tenantId: string;
  name: string;
  cpf: string;
  address: string;
  mobility: 'NORMAL' | 'WHEELCHAIR' | 'STRETCHER' | 'OXYGEN';
  clinicalRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  qrCode?: string;
};

@Injectable()
export class PatientsService {
  private patients: Patient[] = [];

  list(filters: { search?: string; priority?: string; status?: string }) {
    const { search } = filters;
    if (!search) return this.patients;
    const q = search.toLowerCase();
    return this.patients.filter((p) => p.name.toLowerCase().includes(q) || p.cpf.includes(search));
  }

  create(patient: Omit<Patient, 'id'>) {
    const created = { ...patient, id: randomUUID() };
    this.patients.push(created);
    return created;
  }

  update(id: string, payload: Partial<Patient>) {
    const patient = this.patients.find((item) => item.id === id);
    if (!patient) throw new NotFoundException('Patient not found');
    Object.assign(patient, payload);
    return patient;
  }

  qr(id: string) {
    const patient = this.patients.find((item) => item.id === id);
    if (!patient) throw new NotFoundException('Patient not found');
    patient.qrCode = patient.qrCode ?? `PRAEM-${patient.cpf}`;
    return { patientId: id, qrCode: patient.qrCode };
  }

  scan(payload: { qrCode?: string; cpf?: string }) {
    const patient = this.patients.find((item) => item.qrCode === payload.qrCode || item.cpf === payload.cpf);
    if (!patient) throw new NotFoundException('Patient not found');
    return { valid: true, patient };
  }
}
