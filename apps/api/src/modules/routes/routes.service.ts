import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationalFlowService } from '../operational-flow/operational-flow.service';

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);
  private static readonly STALE_HOURS = 12;
  private static readonly CRITICAL_STALE_HOURS = 24;
  private static readonly RECOVERY_REQUIRED_HOURS = 48;
  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: OperationalFlowService,
  ) {}

  async findAll(tenantId: string, query: { status?: string | string[]; date?: string; startDate?: string; endDate?: string; driverId?: string; vehicleId?: string; page?: number; limit?: number }) {
    const { status, date, startDate, endDate, driverId, vehicleId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const statuses = Array.isArray(status) ? status : (typeof status === 'string' ? status.split(',') : undefined);
    const where: any = {
      tenantId,
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
        trips: { include: { patient: true } },
      },
    });
    if (!route) throw new NotFoundException('Route not found');
    const stalePolicy = this.deriveStalePolicy(route, route.trips ?? []);
    if (stalePolicy.isStale && stalePolicy.hasUnresolvedTrips) {
      this.logger.warn(
        `[STALE_ROUTE] routeId=${route.id} tenantId=${tenantId} status=${route.status} elapsedHours=${stalePolicy.elapsedHours} level=${stalePolicy.level} requiresRecovery=${stalePolicy.requiresRecovery}`,
      );
    }
    return {
      ...route,
      operationalStateDerived: this.deriveRouteOperationalStateFromTrips(route.trips ?? [], route.status),
      stalePolicy,
      isStale: stalePolicy.isStale,
      staleLevel: stalePolicy.level,
      staleHours: stalePolicy.elapsedHours,
      requiresRecovery: stalePolicy.requiresRecovery,
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

  async create(tenantId: string, data: any) {
    const payload: any = { ...data, tenantId };
    if (payload.scheduledAt && typeof payload.scheduledAt === 'string') {
      payload.scheduledAt = new Date(payload.scheduledAt);
    }
    if (payload.date && typeof payload.date === 'string') {
      payload.date = new Date(payload.date);
    }
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
    return this.flow.startRoute(
      tenantId,
      id,
      {
        source: input?.source ?? 'routes.start',
        driverId: context?.driverId ?? null,
        actorUserId: context?.actorUserId ?? null,
      },
      input?.tripId,
    );
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
