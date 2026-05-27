export type QrCheckpoint = 'CHECK_IN' | 'BOARDING' | 'ARRIVAL';

export class GenerateQrPayloadDto {
  patientId!: string;
  operationReference?: string;
  tripId?: string;
  routeId?: string;
  checkpoint?: QrCheckpoint;
  validityMinutes?: number;
}

