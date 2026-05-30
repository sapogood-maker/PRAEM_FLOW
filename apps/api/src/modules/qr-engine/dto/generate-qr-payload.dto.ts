export type QrCheckpoint = 'CHECK_IN' | 'BOARDING' | 'ARRIVAL';
export type QrPayloadKind = 'PATIENT' | 'TRIP';

export class GenerateQrPayloadDto {
  patientId!: string;
  kind?: QrPayloadKind;
  operationReference?: string;
  tripId?: string;
  routeId?: string;
  validationToken?: string;
  checkpoint?: QrCheckpoint;
  validityMinutes?: number;
}
