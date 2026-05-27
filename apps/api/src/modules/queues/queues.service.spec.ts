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
  healthcareLocation: {
    findFirst: jest.fn().mockResolvedValue({ id: 'loc-1', name: 'Hospital X', active: true }),
  },
} as unknown as PrismaService;

const mockGateway = {
  emitToTenant: jest.fn(),
  emitAlert: jest.fn(),
} as any;

describe('QueuesService', () => {
  it('creates a queue item and returns id', async () => {
    const service = new QueuesService(mockPrisma, mockGateway);
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

  it('returns ai suggestions', () => {
    const service = new QueuesService(mockPrisma, mockGateway);
    const result = service.aiSuggest('tenant-1');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.tenantId).toBe('tenant-1');
  });
});
