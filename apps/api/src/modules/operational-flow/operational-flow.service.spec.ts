import { OperationalFlowService } from './operational-flow.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  trip: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
  },
  route: {
    findFirst: jest.fn(),
  },
  operationalQueue: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  operationalTimeline: {
    create: jest.fn(),
  },
} as unknown as PrismaService;

const mockGateway = {
  emitToTenant: jest.fn(),
  emitToDriver: jest.fn(),
} as any;

const mockAudit = {
  log: jest.fn(),
} as any;

const mockOperationEvents = {
  record: jest.fn(),
} as any;

describe('OperationalFlowService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.trip.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.trip.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.trip.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.route.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.operationalQueue.findFirst as jest.Mock).mockResolvedValue(null);
    (mockPrisma.operationalQueue.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.operationalTimeline.create as jest.Mock).mockResolvedValue({});
    (mockAudit.log as jest.Mock).mockResolvedValue({});
    (mockOperationEvents.record as jest.Mock).mockResolvedValue({});
  });

  it('promotes boarding trips to in-transit when a route becomes active', async () => {
    const service = new OperationalFlowService(mockPrisma, mockGateway, mockAudit, mockOperationEvents);

    (mockPrisma.trip.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'trip-1',
        patientId: 'patient-1',
        boardedAt: null,
        completedAt: null,
        patient: { name: 'Paciente 1', operationalId: 'OP-1' },
      },
      {
        id: 'trip-2',
        patientId: 'patient-2',
        boardedAt: null,
        completedAt: null,
        patient: { name: 'Paciente 2', operationalId: 'OP-2' },
      },
    ]);

    const result = await (service as any).promoteBoardingTripsToInTransit(
      'tenant-1',
      {
        id: 'route-1',
        tenantId: 'tenant-1',
        driverId: 'driver-1',
        vehicleId: 'vehicle-1',
        status: 'ACTIVE',
      },
      { driverId: 'driver-1', actorUserId: 'user-1', source: 'routes.start' },
      new Date('2026-05-31T14:00:00.000Z'),
      'operation-1',
    );

    expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        routeId: 'route-1',
        status: 'BOARDING',
      },
      data: { status: 'IN_TRANSIT' },
    });
    expect(result).toHaveLength(2);
    expect(mockAudit.log).toHaveBeenCalledTimes(2);
    expect(mockOperationEvents.record).toHaveBeenCalledTimes(2);
  });

  it('completes in-transit trips when a route is completed', async () => {
    const service = new OperationalFlowService(mockPrisma, mockGateway, mockAudit, mockOperationEvents);

    (mockPrisma.trip.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'trip-3',
        patientId: 'patient-3',
        boardedAt: new Date('2026-05-31T13:30:00.000Z'),
        completedAt: null,
        patient: { name: 'Paciente 3', operationalId: 'OP-3' },
      },
    ]);
    (mockPrisma.operationalQueue.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'queue-3' });

    const result = await (service as any).completeInTransitTrips(
      'tenant-1',
      {
        id: 'route-1',
        tenantId: 'tenant-1',
        driverId: 'driver-1',
        vehicleId: 'vehicle-1',
        status: 'ACTIVE',
        operation: { id: 'operation-1', status: 'DISPATCHED', date: new Date('2026-05-31T00:00:00.000Z') },
      },
      { driverId: 'driver-1', actorUserId: 'user-1', source: 'routes.complete' },
    );

    expect(mockPrisma.trip.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        routeId: 'route-1',
        status: 'IN_TRANSIT',
      },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
    expect(mockPrisma.operationalQueue.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    });
    expect(result).toHaveLength(1);
  });

  it('emits route state before promoted trip events during route activation', async () => {
    const service = new OperationalFlowService(mockPrisma, mockGateway, mockAudit, mockOperationEvents);
    const emitTransitionEvents = jest.spyOn(service as any, 'emitTransitionEvents').mockImplementation(() => undefined);
    const emitToRoute = jest.spyOn(service as any, 'emitToRoute').mockImplementation(() => undefined);
    jest.spyOn(service as any, 'loadEntity').mockResolvedValue({
      route: {
        id: 'route-1',
        tenantId: 'tenant-1',
        driverId: 'driver-1',
        vehicleId: 'vehicle-1',
        status: 'DISPATCHED',
        operationalVersion: 1,
        operationId: null,
      },
      trip: null,
    });
    jest.spyOn(service as any, 'updateRouteWithVersion').mockResolvedValue({
      id: 'route-1',
      tenantId: 'tenant-1',
      driverId: 'driver-1',
      vehicleId: 'vehicle-1',
      status: 'ACTIVE',
      operationalVersion: 2,
      operationId: null,
    });
    jest.spyOn(service as any, 'promoteBoardingTripsToInTransit').mockResolvedValue([
      {
        id: 'trip-1',
        patientId: 'patient-1',
        boardedAt: null,
        completedAt: null,
        patient: { name: 'Paciente 1', operationalId: 'OP-1' },
      },
    ]);
    jest.spyOn(service as any, 'deriveRouteOperationalState').mockResolvedValue('IN_TRANSIT');
    jest.spyOn(service as any, 'findRoute').mockResolvedValue({
      id: 'route-1',
      tenantId: 'tenant-1',
      driverId: 'driver-1',
      vehicleId: 'vehicle-1',
      status: 'ACTIVE',
    });
    jest.spyOn(service as any, 'logTransitionAudit').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'persistTimeline').mockResolvedValue(undefined);

    await (service as any).transitionState(
      'tenant-1',
      { routeId: 'route-1' },
      'DRIVER_ACCEPTED',
      { driverId: 'driver-1', actorUserId: 'user-1', source: 'routes.start' },
    );

    expect(emitTransitionEvents).toHaveBeenCalled();
    expect(emitToRoute).toHaveBeenCalled();
    expect(emitTransitionEvents.mock.invocationCallOrder[0]).toBeLessThan(emitToRoute.mock.invocationCallOrder[0]);
  });
});
