export * from '@praem/shared/src';

export interface QueueItem {
  id: string;
  patientId: string;
  destination: string;
  appointmentDate: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'PENDING';
  status: 'WAITING' | 'ASSIGNED' | 'CONFIRMED' | 'CANCELLED';
}
