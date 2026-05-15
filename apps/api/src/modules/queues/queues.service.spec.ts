import { QueuesService } from './queues.service';

describe('QueuesService', () => {
  it('orders queue by priority', () => {
    const service = new QueuesService();

    service.create({
      tenantId: 't1',
      patientId: 'p1',
      destination: 'Destino 1',
      appointmentDate: '2026-05-20',
      priority: 'NORMAL',
      status: 'WAITING',
      queueType: 'LOGISTICS',
      confirmationStatus: 'PENDING',
    });

    service.create({
      tenantId: 't1',
      patientId: 'p2',
      destination: 'Destino 2',
      appointmentDate: '2026-05-20',
      priority: 'CRITICAL',
      status: 'WAITING',
      queueType: 'LOGISTICS',
      confirmationStatus: 'PENDING',
    });

    const ordered = service.findAll();

    expect(ordered[0].priority).toBe('CRITICAL');
    expect(ordered[1].priority).toBe('NORMAL');
  });

  it('filters by queue type', () => {
    const service = new QueuesService();

    service.create({
      tenantId: 't1',
      patientId: 'p1',
      destination: 'Hospital X',
      appointmentDate: '2026-05-20',
      priority: 'HIGH',
      status: 'WAITING',
      queueType: 'MEDICAL',
      confirmationStatus: 'PENDING',
    });

    service.create({
      tenantId: 't1',
      patientId: 'p2',
      destination: 'UBS Norte',
      appointmentDate: '2026-05-20',
      priority: 'NORMAL',
      status: 'WAITING',
      queueType: 'LOGISTICS',
      confirmationStatus: 'CONFIRMED',
    });

    const medical = service.findAll('MEDICAL');
    expect(medical).toHaveLength(1);
    expect(medical[0].queueType).toBe('MEDICAL');
  });
});
