import { createHmac, createHash, randomUUID } from 'crypto';

export type PatientQrPayload = {
  version: number;
  type: 'PATIENT';
  patient_id: string;
  praem_id: string;
  secure_hash: string;
  validation_token: string;
  offline_validation_token?: string;
  issued_at: string;
  expires_at?: string | null;
};

export type TripQrPayload = {
  version: number;
  type: 'TRIP';
  trip_id: string;
  patient_id: string;
  route_id: string;
  operation_id: string;
  secure_hash: string;
  validation_token: string;
  issued_at: string;
  expires_at: string;
};

export function normalizeCpf(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

export function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function secret() {
  return process.env.QR_HMAC_SECRET ?? process.env.OFFLINE_QR_SECRET ?? process.env.JWT_SECRET ?? 'change_me_qr_secret';
}

function signCanonical(values: Array<string | null | undefined>) {
  return createHmac('sha256', secret()).update(values.map((value) => value ?? '').join('|')).digest('hex');
}

export function buildPatientQrPayload(input: {
  patientId: string;
  praemId: string;
  validationToken: string;
  issuedAt?: Date;
  expiresAt?: Date | null;
}) {
  const issuedAt = input.issuedAt ?? new Date();
  const secureHash = signCanonical([input.patientId, input.praemId, input.validationToken]);
  const payload: PatientQrPayload = {
    version: 1,
    type: 'PATIENT',
    patient_id: input.patientId,
    praem_id: input.praemId,
    secure_hash: secureHash,
    validation_token: input.validationToken,
    offline_validation_token: input.validationToken,
    issued_at: issuedAt.toISOString(),
    expires_at: input.expiresAt?.toISOString() ?? null,
  };
  return payload;
}

export function buildTripQrPayload(input: {
  tripId: string;
  patientId: string;
  routeId: string;
  operationId: string;
  validationToken: string;
  issuedAt?: Date;
  expiresAt: Date;
}) {
  const issuedAt = input.issuedAt ?? new Date();
  const secureHash = signCanonical([
    input.tripId,
    input.patientId,
    input.routeId,
    input.operationId,
    input.validationToken,
    input.expiresAt.toISOString(),
  ]);
  const payload: TripQrPayload = {
    version: 1,
    type: 'TRIP',
    trip_id: input.tripId,
    patient_id: input.patientId,
    route_id: input.routeId,
    operation_id: input.operationId,
    secure_hash: secureHash,
    validation_token: input.validationToken,
    issued_at: issuedAt.toISOString(),
    expires_at: input.expiresAt.toISOString(),
  };
  return payload;
}

export function issueQrToken() {
  return randomUUID();
}
