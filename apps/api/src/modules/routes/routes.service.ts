import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';
import { OperationEventsService } from '../operation-events/operation-events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { TripTokensService } from '../trip-tokens/trip-tokens.service';
import { OperationsGateway } from '../../gateways/operations.gateway';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);
  private static readonly STALE_HOURS = 12;
  private static readonly CRITICAL_STALE_HOURS = 24;
  private static readonly RECOVERY_REQUIRED_HOURS = 48;
  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: OperationalFlowService,
    private readonly operationEvents: OperationEventsService,
    private readonly tripTokens: TripTokensService,
    private readonly opsGateway: OperationsGateway,
    @Optional() private readonly whatsapp?: WhatsappService,
  ) {}

  async findAll(tenantId: string, query: { status?: string | string[]; date?: string; startDate?: string; endDate?: string; driverId?: string; vehicleId?: string; page?: number; limit?: number }) {
    const { status, date, startDate, endDate, driverId, vehicleId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const statuses = Array.isArray(status) ? status : (typeof status === 'string' ? status.split(',') : undefined);
    const where: any = {
      tenantId,
      trips: { some: {} },
      ...(statuses && { status: { in: statuses as any[] } }),
      ...(driverId && { driverId }),
      ...(vehicleId && { vehicleId }),
      ...(date && {
        date: {
          gte: new Date(date + 'T00:00:00Z'),
          lte: new Date(date + 'T23:59:59Z'),
        },
      }),
      ...(!date && startDate && endDate && {
        date: {
          gte: new Date(startDate + 'T00:00:00Z'),
          lte: new Date(endDate + 'T23:59:59Z'),
        },
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.route.findMany({
        where,
        skip,
        take: limit,
        include: {
          driver: { include: { user: { select: { name: true } } } },
          vehicle: { select: { id: true, plate: true, model: true, capacity: true } },
          trips: { select: { id: true, status: true, boardedAt: true } },
        },
        orderBy: { date: 'desc' },
      }),
      this.prisma.route.count({ where }),
    ]);
    const mapped = items.map((r: any) => {
      const operationalStateDerived = this.deriveRouteOperationalStateFromTrips(r.trips ?? [], r.status);
      const stalePolicy = this.deriveStalePolicy(r, r.trips ?? []);
      if (stalePolicy.isStale && stalePolicy.hasUnresolvedTrips) {
        this.logger.warn(
          `[STALE_ROUTE] routeId=${r.id} tenantId=${tenantId} status=${r.status} elapsedHours=${stalePolicy.elapsedHours} level=${stalePolicy.level} requiresRecovery=${stalePolicy.requiresRecovery}`,
        );
      }
      return {
        ...r,
        operationalStateDerived,
        stalePolicy,
        isStale: stalePolicy.isStale,
        staleLevel: stalePolicy.level,
        staleHours: stalePolicy.elapsedHours,
        requiresRecovery: stalePolicy.requiresRecovery,
      };
    });
    return { items: mapped, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, tenantId },
      include: {
        driver: { include: { user: true } },
        vehicle: true,
        trips: { include: { patient: true, stops: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    const stalePolicy = this.deriveStalePolicy(route, route.trips ?? []);
    if (stalePolicy.isStale && stalePolicy.hasUnresolvedTrips) {
      this.logger.warn(
        `[STALE_ROUTE] routeId=${route.id} tenantId=${tenantId} status=${route.status} elapsedHours=${stalePolicy.elapsedHours} level=${stalePolicy.level} requiresRecovery=${stalePolicy.requiresRecovery}`,
      );
    }
    const navigationDestination = this.deriveNavigationDestination(route, route.trips ?? []);
    this.logger.debug(`[NAVIGATION] routeId=${route.id} dest=${navigationDestination ? `${navigationDestination.type}@${navigationDestination.lat},${navigationDestination.lng}` : 'none'}`);
    return {
      ...route,
      operationalStateDerived: this.deriveRouteOperationalStateFromTrips(route.trips ?? [], route.status),
      stalePolicy,
      isStale: stalePolicy.isStale,
      staleLevel: stalePolicy.level,
      staleHours: stalePolicy.elapsedHours,
      requiresRecovery: stalePolicy.requiresRecovery,
      navigationDestination,
    };
  }

  async diagnostics(id: string, tenantId: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        dispatchType: true,
        date: true,
        scheduledAt: true,
        createdAt: true,
        driverId: true,
        vehicleId: true,
        trips: {
          select: { id: true, tenantId: true, patientId: true, status: true, boardedAt: true, completedAt: true },
          orderBy: [{ boardedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    const stalePolicy = this.deriveStalePolicy(route, route.trips ?? []);
    return {
      routeId: route.id,
      tenantId: route.tenantId,
      routeStatus: route.status,
      dispatchType: route.dispatchType,
      date: route.date,
      driverId: route.driverId,
      vehicleId: route.vehicleId,
      totalTrips: route.trips.length,
      tripStatuses: route.trips.map((t: { status: string }) => t.status),
      operationalStateDerived: this.deriveRouteOperationalStateFromTrips(route.trips, route.status),
      stalePolicy,
      trips: route.trips,
    };
  }

  async dispatchOperation(
    tenantId: string,
    input: {
      queueIds: string[];
      driverId?: string;
      vehicleId?: string;
      locationId?: string;
      origin?: string;
      destination?: string;
      dispatchType?: 'IMMEDIATE' | 'SCHEDULED';
      scheduledAt?: string;
      date?: string;
      sendPatientNotifications?: boolean;
      sendBoardingQr?: boolean;
    },
    context?: { actorUserId?: string },
  ) {
    const queueIds = [...new Set((input.queueIds ?? []).filter(Boolean))];
    if (queueIds.length === 0) {
      throw new BadRequestException('Selecione pelo menos um paciente da fila operacional para despachar.');
    }

    const queueRows = await this.prisma.operationalQueue.findMany({
      where: { tenantId, id: { in: queueIds } },
      include: {
        patient: { select: { id: true, name: true } },
        healthcareLocation: { select: { id: true, name: true } },
      },
    });
    if (queueRows.length !== queueIds.length) {
      throw new NotFoundException('Um ou mais itens da fila não foram encontrados para este tenant.');
    }

    const blocked = queueRows.filter((q) =>
      ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'ARRIVED'].includes(String(q.status).toUpperCase()),
    );
    if (blocked.length > 0) {
      throw new BadRequestException('A fila contém operações já finalizadas/canceladas e não pode ser despachada.');
    }

    const normalizedDispatchType = input.dispatchType === 'SCHEDULED' ? 'SCHEDULED' : 'IMMEDIATE';
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const routeDate = input.date
      ? new Date(input.date)
      : (scheduledAt ?? queueRows[0]?.appointmentDate ?? new Date());
    const operationDate = new Date(routeDate);
    operationDate.setHours(0, 0, 0, 0);
    const routeStatus = normalizedDispatchType === 'SCHEDULED' ? 'SCHEDULED' : 'PLANNED';
    const queueAssignedStatus = normalizedDispatchType === 'SCHEDULED' ? 'SCHEDULED' : 'ASSIGNED';
    const origin = (input.origin ?? 'Prefeitura Municipal').trim();

    let destination = (input.destination ?? '').trim();
    if (!destination && input.locationId) {
      const location = await this.prisma.healthcareLocation.findFirst({
        where: { id: input.locationId, tenantId },
        select: { name: true },
      });
      destination = location?.name ?? '';
    }
    if (!destination) {
      destination =
        queueRows[0]?.healthcareLocation?.name ??
        queueRows[0]?.destination ??
        'Destino não informado';
    }

    const operation = await this.prisma.operation.upsert({
      where: { tenantId_date: { tenantId, date: operationDate } },
      create: {
        tenantId,
        date: operationDate,
        status: normalizedDispatchType === 'SCHEDULED' ? 'PENDING_DISPATCH' as any : 'DISPATCHED' as any,
        createdAutomatically: false,
        totalPatients: queueIds.length,
        totalRoutes: 1,
        totalDrivers: input.driverId ? 1 : 0,
        totalVehicles: input.vehicleId ? 1 : 0,
      },
      update: {
        status: normalizedDispatchType === 'SCHEDULED' ? 'PENDING_DISPATCH' as any : 'DISPATCHED' as any,
        totalPatients: { increment: queueIds.length },
        totalRoutes: { increment: 1 },
        ...(input.driverId ? { totalDrivers: { increment: 1 } } : {}),
        ...(input.vehicleId ? { totalVehicles: { increment: 1 } } : {}),
      },
    });
    await this.operationEvents.record({
      tenantId,
      operationId: operation.id,
      eventType: 'OPERATION_CREATED',
      actorType: context?.actorUserId ? 'USER' : 'SYSTEM',
      actorId: context?.actorUserId ?? null,
      metadata: {
        source: 'routes.dispatch-operation',
        dispatchType: normalizedDispatchType,
        queueCount: queueIds.length,
        routeDate: routeDate.toISOString(),
      },
    });

    const { route, trips } = await this.prisma.$transaction(async (tx) => {
      const createdRoute = await tx.route.create({
        data: {
          tenantId,
          operationId: operation.id,
          driverId: input.driverId ?? null,
          vehicleId: input.vehicleId ?? null,
          date: routeDate,
          scheduledAt,
          origin,
          destination,
          status: routeStatus as any,
          dispatchType: normalizedDispatchType as any,
        },
      });

      const createdTrips: Array<{ id: string; patientId: string; routeId: string }> = [];
      for (const row of queueRows) {
        const trip = await tx.trip.create({
          data: {
            tenantId,
            operationId: operation.id,
            routeId: createdRoute.id,
            patientId: row.patientId,
            status: 'SCHEDULED' as any,
            qrScanned: false,
          },
          select: { id: true, patientId: true, routeId: true },
        });
        createdTrips.push(trip);
      }

      await tx.operationalQueue.updateMany({
        where: { tenantId, id: { in: queueIds } },
        data: { status: queueAssignedStatus as any, operationId: operation.id },
      });

      await tx.operationalTimeline.create({
        data: {
          tenantId,
          operationId: operation.id,
          routeId: createdRoute.id,
          eventType: 'DISPATCH_COMMAND_EXECUTED',
          fromState: 'CREATED',
          toState: normalizedDispatchType === 'IMMEDIATE' ? 'DISPATCHED' : 'SCHEDULED',
          source: 'ROUTES_DISPATCH_OPERATION',
          metadata: {
            queueIds,
            queueCount: queueIds.length,
            tripCount: createdTrips.length,
            driverId: input.driverId ?? null,
            vehicleId: input.vehicleId ?? null,
            actorUserId: context?.actorUserId ?? null,
          } as any,
        },
      });

      return { route: createdRoute, trips: createdTrips };
    });

    for (const queueId of queueIds) {
      this.opsGateway.emitToTenant(tenantId, 'queue.updated', {
        id: queueId,
        action: 'ASSIGNED_TO_ROUTE',
        routeId: route.id,
        status: queueAssignedStatus,
      });
    }
    await this.operationEvents.record({
      tenantId,
      operationId: operation.id,
      routeId: route.id,
      eventType: 'OPERATION_DISPATCHED',
      actorType: context?.actorUserId ? 'USER' : 'SYSTEM',
      actorId: context?.actorUserId ?? null,
      metadata: {
        dispatchType: normalizedDispatchType,
        queueIds,
        queueCount: queueIds.length,
        routeId: route.id,
      },
    });
    if (route.driverId) {
      await this.operationEvents.record({
        tenantId,
        operationId: operation.id,
        routeId: route.id,
        eventType: 'DRIVER_ASSIGNED',
        actorType: context?.actorUserId ? 'USER' : 'SYSTEM',
        actorId: context?.actorUserId ?? null,
        metadata: { driverId: route.driverId },
      });
    }
    if (route.vehicleId) {
      await this.operationEvents.record({
        tenantId,
        operationId: operation.id,
        routeId: route.id,
        eventType: 'VEHICLE_ASSIGNED',
        actorType: context?.actorUserId ? 'USER' : 'SYSTEM',
        actorId: context?.actorUserId ?? null,
        metadata: { vehicleId: route.vehicleId },
      });
    }

    if (route.driverId && normalizedDispatchType === 'IMMEDIATE') {
      await this.flow.recordDispatch(tenantId, route.id, {
        driverId: route.driverId,
        vehicleId: route.vehicleId,
        actorUserId: context?.actorUserId ?? null,
        source: 'routes.dispatch-operation',
      });
    }

    const notificationsEnabled = input.sendPatientNotifications !== false;
    const sendBoardingQr = input.sendBoardingQr !== false;
    const notificationResults: Array<{ tripId: string; patientId: string; confirmation: string; qr: string; boardingToken: string }> = [];

    if (this.whatsapp && notificationsEnabled) {
      const driver = route.driverId
        ? await this.prisma.driver.findUnique({
            where: { id: route.driverId },
            select: { user: { select: { name: true } } },
          })
        : null;
      const driverName = driver?.user?.name ?? 'A definir';
      const operationDate = routeDate.toLocaleDateString('pt-BR');
      const operationTime = routeDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const sends = await Promise.allSettled(
        trips.map(async (trip) => {
          const [boardingToken, confirmation, qr] = await Promise.allSettled([
            this.tripTokens.generate(tenantId, trip.id, 'BOARDING'),
            this.whatsapp!.notifyAppointmentConfirmed(tenantId, trip.patientId, trip.id, {
              operation_date: operationDate,
              operation_time: operationTime,
              pickup_location: origin,
              destination,
              driver_name: driverName,
            }),
            sendBoardingQr
              ? this.whatsapp!.sendBoardingQr(tenantId, trip.id)
              : Promise.resolve({ status: 'SKIPPED' }),
          ]);

          return {
            tripId: trip.id,
            patientId: trip.patientId,
            confirmation: confirmation.status === 'fulfilled' ? String(confirmation.value?.status ?? 'SENT') : 'FAILED',
            qr: qr.status === 'fulfilled' ? String(qr.value?.status ?? 'SENT') : 'FAILED',
            boardingToken: boardingToken.status === 'fulfilled' ? 'GENERATED' : 'FAILED',
          };
        }),
      );

      for (const row of sends) {
        if (row.status === 'fulfilled') {
          notificationResults.push(row.value);
        }
      }
    }

    this.opsGateway.emitToTenant(tenantId, 'operation:dispatched', {
      operationId: operation.id,
      routeId: route.id,
      queueIds,
      tripCount: trips.length,
      status: operation.status,
      dispatchType: normalizedDispatchType,
      timestamp: new Date().toISOString(),
    });

    return {
      operationId: operation.id,
      routeId: route.id,
      routeStatus: route.status,
      dispatchType: route.dispatchType,
      operationStatus: operation.status,
      queueCount: queueIds.length,
      tripsCreated: trips.length,
      notifications: notificationResults,
    };
  }

  async create(tenantId: string, data: any) {
    const payload: any = { ...data, tenantId };
    const queueIds = Array.isArray(payload.queueIds)
      ? [...new Set(payload.queueIds.filter(Boolean))]
      : [];
    delete payload.queueIds;

    if (payload.scheduledAt && typeof payload.scheduledAt === 'string') {
      payload.scheduledAt = new Date(payload.scheduledAt);
    }
    if (payload.date && typeof payload.date === 'string') {
      payload.date = new Date(payload.date);
    }
    if (queueIds.length === 0) {
      throw new BadRequestException('Rotas devem conter pelo menos um paciente. Selecione itens da fila operacional.');
    }
    const operationDate = new Date(payload.date ?? payload.scheduledAt ?? Date.now());
    operationDate.setHours(0, 0, 0, 0);
    const operation = await this.prisma.operation.upsert({
      where: { tenantId_date: { tenantId, date: operationDate } },
      create: {
        tenantId,
        date: operationDate,
        status: payload.dispatchType === 'SCHEDULED' ? 'PENDING_DISPATCH' as any : 'IMPORTED' as any,
        createdAutomatically: false,
      },
      update: {},
    });
    payload.operationId = operation.id;
    // Default status for scheduled (future) routes
    if (!payload.status) {
      payload.status = payload.dispatchType === 'SCHEDULED' ? 'SCHEDULED' : 'PLANNED';
    }
    const route = await this.prisma.route.create({ data: payload });
    if (route.driverId && route.dispatchType === 'IMMEDIATE') {
      await this.flow.recordDispatch(tenantId, route.id, {
        driverId: route.driverId,
        vehicleId: route.vehicleId,
        source: 'dispatch',
      });
    }
    return route;
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const payload: any = { ...data };
    if (payload.scheduledAt && typeof payload.scheduledAt === 'string') {
      payload.scheduledAt = new Date(payload.scheduledAt);
    }
    if (payload.date && typeof payload.date === 'string') {
      payload.date = new Date(payload.date);
    }
    return this.prisma.route.update({ where: { id }, data: payload });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    await this.prisma.route.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { cancelled: true };
  }

  /** Driver starts the route — status PLANNED → ACTIVE */
  async startRoute(
    id: string,
    tenantId: string,
    input?: { tripId?: string; source?: string },
    context?: { driverId?: string; actorUserId?: string },
  ) {
    this.logger.log(`[ROUTE] startRoute tenantId=${tenantId} routeId=${id} tripId=${input?.tripId ?? '-'} source=${input?.source ?? 'routes.start'}`);
    const result = await this.flow.startRoute(
      tenantId,
      id,
      {
        source: input?.source ?? 'routes.start',
        driverId: context?.driverId ?? null,
        actorUserId: context?.actorUserId ?? null,
      },
      input?.tripId,
    );

    // [WHATSAPP] Notify all patients in this route that the route has started
    if (this.whatsapp) {
      const trips = await this.prisma.trip.findMany({
        where: { routeId: id, tenantId, status: { notIn: ['CANCELLED', 'NO_SHOW'] as any } },
        select: { id: true, patientId: true },
      });
      for (const trip of trips) {
        this.whatsapp.notifyRouteStarted(tenantId, trip.patientId, trip.id, id).catch((err) =>
          this.logger.warn(`[WHATSAPP] notifyRouteStarted failed patientId=${trip.patientId}: ${err}`),
        );
      }
    }

    return result;
  }

  /** Route fully complete — status ACTIVE → COMPLETED */
  async completeRoute(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    this.logger.log(`[ROUTE] completeRoute tenantId=${tenantId} routeId=${id} driverId=${context?.driverId ?? '-'}`);
    return this.flow.completeRoute(tenantId, id, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'routes.complete',
    });
  }

  /** Emergency recovery: force-complete all pending trips and the route */
  async forceCompleteRoute(id: string, tenantId: string, context?: { driverId?: string; actorUserId?: string }) {
    this.logger.log(`[ROUTE] forceCompleteRoute tenantId=${tenantId} routeId=${id} driverId=${context?.driverId ?? '-'}`);
    return this.flow.forceCompleteRoute(tenantId, id, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'routes.force-complete',
    });
  }

  optimize(id: string) {
    return { routeId: id, optimized: true, message: 'Rota otimizada por heurística de distância' };
  }

  async getTimeline(id: string, tenantId: string) {
    const route = await this.findOne(id, tenantId);
    const operationId = route.operationId ?? null;
    const events = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        ...(operationId ? { operationId } : { routeId: id }),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    // Enrich with trip + patient info when patientId is present
    const patientIds = [...new Set(events.map((e) => e.patientId).filter(Boolean) as string[])];
    const patients = patientIds.length > 0
      ? await this.prisma.patient.findMany({
          where: { id: { in: patientIds }, tenantId },
          select: { id: true, name: true },
        })
      : [];
    const patientMap = new Map(patients.map((p) => [p.id, p.name]));
    return events.map((e) => ({
      ...e,
      patientName: e.patientId ? (patientMap.get(e.patientId) ?? null) : null,
      source: (e as any).actorType ?? null,
      fromState: (e.metadata as Record<string, unknown> | null)?.fromState ?? null,
      toState: (e.metadata as Record<string, unknown> | null)?.toState ?? null,
    }));
  }

  async recoverStaleRoutes(tenantId: string, cutoffHours?: number, context?: { driverId?: string; actorUserId?: string }) {
    return this.flow.recoverStaleRoutes(tenantId, cutoffHours ?? 12, {
      driverId: context?.driverId ?? null,
      actorUserId: context?.actorUserId ?? null,
      source: 'routes.recovery-stale',
    });
  }

  private deriveRouteOperationalStateFromTrips(trips: Array<{ status: string; boardedAt?: Date | null }>, routeStatus: string) {
    const statuses = trips.map((t) => String(t.status));
    if (statuses.length === 0) return routeStatus;
    const hasTransit = statuses.some((s) => s === 'IN_TRANSIT');
    const hasBoarded = statuses.some((s) => s === 'BOARDED' || s === 'ARRIVED' || s === 'COMPLETED') || trips.some((t) => !!t.boardedAt);
    const hasPending = statuses.some((s) => ['SCHEDULED', 'CONFIRMED', 'BOARDING'].includes(s));
    if (hasTransit) return 'IN_TRANSIT';
    if (hasBoarded && hasPending) return 'BOARDED';
    if (hasBoarded) return 'BOARDED';
    if (statuses.every((s) => ['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(s))) return 'COMPLETED';
    return routeStatus;
  }

  private deriveNavigationDestination(
    route: { status: string; origin?: string | null; destination?: string | null },
    trips: Array<{
      status: string;
      boardedAt?: Date | null;
      patient?: { name: string; address: string; lat?: number | null; lng?: number | null } | null;
      stops?: Array<{ type: string; status: string; name: string; lat?: number | null; lng?: number | null; sequence: number }>;
    }>,
  ): { type: 'PATIENT_PICKUP' | 'HOSPITAL' | 'RETURN'; name: string; address?: string | null; lat: number; lng: number } | null {
    const operationalState = this.deriveRouteOperationalStateFromTrips(trips, route.status);
    const preBoarding =
      ['DISPATCHED', 'PLANNED', 'SCHEDULED', 'PENDING', 'PREPARING'].includes(route.status.toUpperCase()) ||
      ['DISPATCHED', 'DRIVER_ACCEPTED', 'WAITING_PATIENT', 'BOARDING'].some((s) => operationalState.toUpperCase().includes(s));

    if (preBoarding) {
      const unboarded = trips.filter((t) => {
        const s = t.status.toUpperCase();
        return !['COMPLETED', 'CANCELLED', 'NO_SHOW', 'ARRIVED', 'IN_TRANSIT', 'IN_PROGRESS'].includes(s);
      });
      for (const trip of unboarded) {
        if (trip.patient?.lat && trip.patient?.lng) {
          return { type: 'PATIENT_PICKUP', name: trip.patient.name, address: trip.patient.address, lat: trip.patient.lat, lng: trip.patient.lng };
        }
      }
    }

    const allStops = trips.flatMap((t) => t.stops ?? []);
    allStops.sort((a, b) => a.sequence - b.sequence);
    const nextStop = allStops.find((s) => !['COMPLETED', 'SKIPPED'].includes(s.status.toUpperCase()) && s.lat && s.lng);
    if (nextStop?.lat && nextStop?.lng) {
      const isReturn = ['RETURN', 'DROPOFF'].includes(nextStop.type.toUpperCase());
      return { type: isReturn ? 'RETURN' : 'HOSPITAL', name: nextStop.name, lat: nextStop.lat, lng: nextStop.lng };
    }

    return null;
  }

  private deriveStalePolicy(
    route: {
      status: string;
      date?: Date | null;
      scheduledAt?: Date | null;
      createdAt?: Date | null;
    },
    trips: Array<{ status: string; boardedAt?: Date | null }>,
  ) {
    const now = new Date();
    const referenceAt = route.scheduledAt ?? route.date ?? route.createdAt ?? now;
    const elapsedHours = Math.max(0, Math.floor((now.getTime() - new Date(referenceAt).getTime()) / (1000 * 60 * 60)));
    const statuses = trips.map((t) => String(t.status).toUpperCase());
    const hasTransitPassengers = statuses.some((s) => s === 'IN_TRANSIT' || s === 'IN_PROGRESS');
    const hasBoardedPassengers = statuses.some((s) => s === 'BOARDED' || s === 'ARRIVED' || s === 'BOARDING') || trips.some((t) => !!t.boardedAt);
    const hasUnresolvedTrips = statuses.some((s) => !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(s));
    const hasUnresolvedRoute = !['COMPLETED', 'CANCELLED'].includes(String(route.status).toUpperCase());
    const staleCandidate = hasUnresolvedRoute || hasUnresolvedTrips || hasTransitPassengers || hasBoardedPassengers;
    const isStale = staleCandidate && elapsedHours > RoutesService.STALE_HOURS;
    let level: 'FRESH' | 'STALE' | 'CRITICAL_STALE' | 'RECOVERY_REQUIRED' = 'FRESH';
    if (staleCandidate && elapsedHours > RoutesService.RECOVERY_REQUIRED_HOURS) {
      level = 'RECOVERY_REQUIRED';
    } else if (staleCandidate && elapsedHours > RoutesService.CRITICAL_STALE_HOURS) {
      level = 'CRITICAL_STALE';
    } else if (staleCandidate && elapsedHours > RoutesService.STALE_HOURS) {
      level = 'STALE';
    }
    return {
      referenceAt: new Date(referenceAt).toISOString(),
      elapsedHours,
      staleAfterHours: RoutesService.STALE_HOURS,
      criticalAfterHours: RoutesService.CRITICAL_STALE_HOURS,
      recoveryRequiredAfterHours: RoutesService.RECOVERY_REQUIRED_HOURS,
      isStale,
      level,
      requiresRecovery: level === 'RECOVERY_REQUIRED',
      hasUnresolvedRoute,
      hasUnresolvedTrips,
      hasBoardedPassengers,
      hasTransitPassengers,
    };
  }
}
