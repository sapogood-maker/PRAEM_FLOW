import { QueuesService } from './queues.service';
import { PrismaService } from '../../prisma/prisma.service';

// Minimal mock for PrismaService – tests don't need a real DB
const mockPrisma = {
  operationalQueue: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'test-id', ...args.data })),
    update: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: args.where.id, ...args.data })),
    findFirst: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({}),
  },
  operation: {
    upsert: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'op-test-id', status: 'IMPORTED', ...args.create })),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  healthcareLocation: {
    findFirst: jest.fn().mockResolvedValue({ id: 'loc-1', name: 'Hospital X', active: true }),
  },
} as unknown as PrismaService;

const mockGateway = {
  emitToTenant: jest.fn(),
  emitAlert: jest.fn(),
} as any;

const mockOperationEvents = {
  record: jest.fn().mockResolvedValue({}),
} as any;

describe('QueuesService', () => {
  it('creates a queue item and returns id', async () => {
    const service = new QueuesService(mockPrisma, mockGateway, mockOperationEvents);
    const result = await service.create('t1', {
      tenantId: 't1',
      patientId: 'p1',
      healthcareLocationId: 'loc-1',
      appointmentDate: new Date('2026-05-20'),
      priority: 'CRITICAL',
      status: 'WAITING',
      queueType: 'LOGISTICS',
    });
    expect(result).toHaveProperty('id');
  });

  it('returns ai suggestions', async () => {
    const service = new QueuesService(mockPrisma, mockGateway, mockOperationEvents);
    (mockPrisma.operationalQueue.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'q1',
        patientId: 'p1',
        appointmentDate: new Date('2026-05-20T08:10:00Z'),
        healthcareLocationId: 'loc-1',
        destination: 'Hospital X',
        recurrenceType: null,
        patient: { id: 'p1', name: 'Paciente A', mobility: 'NORMAL' },
        healthcareLocation: { id: 'loc-1', name: 'Hospital X' },
      },
      {
        id: 'q2',
        patientId: 'p2',
        appointmentDate: new Date('2026-05-20T08:40:00Z'),
        healthcareLocationId: 'loc-1',
        destination: 'Hospital X',
        recurrenceType: null,
        patient: { id: 'p2', name: 'Paciente B', mobility: 'WHEELCHAIR' },
        healthcareLocation: { id: 'loc-1', name: 'Hospital X' },
      },
    ]);
    const result = await service.aiSuggest('tenant-1');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.tenantId).toBe('tenant-1');
  });
});
