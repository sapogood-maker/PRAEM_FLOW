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
    });

    service.create({
      tenantId: 't1',
      patientId: 'p2',
      destination: 'Destino 2',
      appointmentDate: '2026-05-20',
      priority: 'CRITICAL',
      status: 'WAITING',
    });

    const ordered = service.findAll();

    expect(ordered[0].priority).toBe('CRITICAL');
    expect(ordered[1].priority).toBe('NORMAL');
  });
});
