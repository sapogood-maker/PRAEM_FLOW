import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutesService } from '../routes/routes.service';

type SuggestionCacheEntry = {
  tenantId: string;
  suggestionId: string;
  queueIds: string[];
  locationId?: string;
  destination: string;
  origin: string;
  driverId?: string;
  vehicleId?: string;
  date: string;
  createdAt: number;
};

@Injectable()
export class DispatchSuggestionService {
  private readonly cache = new Map<string, SuggestionCacheEntry>();
  private static readonly CACHE_TTL_MS = 2 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly routesService: RoutesService,
  ) {}

  async generateSuggestions(tenantId: string, options?: { limit?: number }) {
    const limit = Math.max(1, Math.min(500, Number(options?.limit ?? 200)));
    const [pendingQueue, vehicles, drivers] = await Promise.all([
      this.prisma.operationalQueue.findMany({
        where: {
          tenantId,
          status: { in: ['WAITING_DISPATCH', 'WAITING'] as any[] },
        },
        include: {
          patient: { select: { id: true, name: true, mobility: true } },
          healthcareLocation: { select: { id: true, name: true, city: true } },
          demand: { select: { wheelchair: true, stretcher: true, returnTrip: true } },
        },
        orderBy: [{ appointmentDate: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
        take: limit,
      }),
      this.prisma.vehicle.findMany({
        where: { tenantId, active: true, status: 'AVAILABLE' as any },
        select: { id: true, plate: true, model: true, type: true, capacity: true, wheelchair: true, stretcher: true },
      }),
      this.prisma.driver.findMany({
        where: { tenantId, active: true, status: 'AVAILABLE' as any },
        select: { id: true, user: { select: { name: true } } },
      }),
    ]);

    this.evictExpiredCache();

    const grouped = new Map<string, typeof pendingQueue>();
    for (const row of pendingQueue) {
      const bucketDate = row.appointmentDate.toISOString().slice(0, 13);
      const destinationKey = row.healthcareLocationId ?? row.destination ?? 'sem-destino';
      const city = row.healthcareLocation?.city ?? '';
      const key = `${destinationKey}|${city}|${bucketDate}`;
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }

    const suggestions: Array<Record<string, unknown>> = [];
    const usedVehicleIds = new Set<string>();
    let driverCursor = 0;

    for (const rows of grouped.values()) {
      if (rows.length === 0) continue;

      const destination = rows[0].healthcareLocation?.name ?? rows[0].destination ?? 'Destino não informado';
      const municipality = rows[0].healthcareLocation?.city ?? null;
      const locationId = rows[0].healthcareLocationId ?? undefined;
      const appointment = rows[0].appointmentDate;

      const requiresWheelchair = rows.some((r) =>
        (r.patient?.mobility ?? '').toUpperCase() === 'WHEELCHAIR' || Boolean(r.demand?.wheelchair),
      );
      const requiresStretcher = rows.some((r) =>
        (r.patient?.mobility ?? '').toUpperCase() === 'STRETCHER' || Boolean(r.demand?.stretcher),
      );
      const hasReturnTrip = rows.some((r) => Boolean(r.demand?.returnTrip));

      const vehicle = this.pickVehicle({
        vehicles,
        usedVehicleIds,
        passengerCount: rows.length,
        requiresWheelchair,
        requiresStretcher,
      });
      if (vehicle) usedVehicleIds.add(vehicle.id);

      const chunkSize = Math.max(1, vehicle?.capacity ?? 4);
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const queueIds = chunk.map((q) => q.id);
        if (queueIds.length === 0) continue;

        const driver = drivers.length > 0 ? drivers[driverCursor % drivers.length] : null;
        driverCursor += 1;

        const suggestionId = createHash('sha1')
          .update(`${tenantId}|${queueIds.join(',')}|${vehicle?.id ?? ''}|${driver?.id ?? ''}|${appointment.toISOString()}`)
          .digest('hex')
          .slice(0, 16);

        const suggestedDeparture = new Date(appointment.getTime() - 45 * 60 * 1000);
        const cacheEntry: SuggestionCacheEntry = {
          tenantId,
          suggestionId,
          queueIds,
          locationId,
          destination,
          origin: 'Prefeitura Municipal',
          driverId: driver?.id ?? undefined,
          vehicleId: vehicle?.id ?? undefined,
          date: suggestedDeparture.toISOString(),
          createdAt: Date.now(),
        };
        this.cache.set(this.cacheKey(tenantId, suggestionId), cacheEntry);

        suggestions.push({
          suggestionId,
          vehicle: vehicle
            ? {
                id: vehicle.id,
                plate: vehicle.plate,
                model: vehicle.model,
                capacity: vehicle.capacity,
              }
            : null,
          driver: driver
            ? {
                id: driver.id,
                name: driver.user?.name ?? null,
              }
            : null,
          destination,
          municipality,
          suggestedDeparture: suggestedDeparture.toISOString(),
          appointmentWindow: `${appointment.toISOString().slice(0, 10)} ${String(appointment.getHours()).padStart(2, '0')}:00`,
          patientCount: chunk.length,
          queueIds,
          requirements: {
            wheelchair: requiresWheelchair,
            stretcher: requiresStretcher,
            returnTrip: hasReturnTrip,
          },
          patients: chunk.map((row) => ({
            queueId: row.id,
            patientId: row.patientId,
            name: row.patient?.name ?? row.patientId,
            appointmentDate: row.appointmentDate,
            priority: row.priority,
            specialRequirements: {
              wheelchair:
                (row.patient?.mobility ?? '').toUpperCase() === 'WHEELCHAIR' || Boolean(row.demand?.wheelchair),
              stretcher:
                (row.patient?.mobility ?? '').toUpperCase() === 'STRETCHER' || Boolean(row.demand?.stretcher),
              returnTrip: Boolean(row.demand?.returnTrip),
            },
          })),
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      pendingQueueItems: pendingQueue.length,
      availableVehicles: vehicles.length,
      availableDrivers: drivers.length,
      suggestions,
    };
  }

  async approveSuggestion(tenantId: string, suggestionId: string, actorUserId?: string) {
    if (!suggestionId) throw new BadRequestException('suggestionId is required');
    this.evictExpiredCache();

    const key = this.cacheKey(tenantId, suggestionId);
    const suggestion = this.cache.get(key);
    if (!suggestion) throw new NotFoundException('Suggestion not found or expired');

    const queueRows = await this.prisma.operationalQueue.findMany({
      where: { tenantId, id: { in: suggestion.queueIds } },
      select: { id: true, status: true },
    });
    if (queueRows.length !== suggestion.queueIds.length) {
      throw new BadRequestException('Cannot approve suggestion because queue items changed');
    }
    const invalid = queueRows.filter((row) =>
      ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'ARRIVED', 'IN_TRANSIT'].includes(String(row.status).toUpperCase()),
    );
    if (invalid.length > 0) {
      throw new BadRequestException('Cannot approve suggestion with finalized queue items');
    }

    const result = await this.routesService.dispatchOperation(
      tenantId,
      {
        queueIds: suggestion.queueIds,
        driverId: suggestion.driverId,
        vehicleId: suggestion.vehicleId,
        locationId: suggestion.locationId,
        origin: suggestion.origin,
        destination: suggestion.destination,
        dispatchType: 'IMMEDIATE',
        date: suggestion.date,
        sendPatientNotifications: true,
        sendBoardingQr: true,
      },
      { actorUserId },
    );
    this.cache.delete(key);

    return {
      suggestionId,
      approvedAt: new Date().toISOString(),
      ...result,
    };
  }

  private pickVehicle(input: {
    vehicles: Array<{
      id: string;
      plate: string;
      model: string;
      type: string;
      capacity: number;
      wheelchair: boolean;
      stretcher: boolean;
    }>;
    usedVehicleIds: Set<string>;
    passengerCount: number;
    requiresWheelchair: boolean;
    requiresStretcher: boolean;
  }) {
    const compatible = input.vehicles
      .filter((vehicle) => vehicle.capacity >= input.passengerCount || vehicle.capacity >= 1)
      .filter((vehicle) => {
        if (input.requiresStretcher) {
          return vehicle.stretcher || String(vehicle.type).toUpperCase() === 'AMBULANCE';
        }
        if (input.requiresWheelchair) {
          const type = String(vehicle.type).toUpperCase();
          return vehicle.wheelchair || type === 'ADAPTED' || type === 'AMBULANCE';
        }
        return true;
      })
      .sort((a, b) => a.capacity - b.capacity);

    const unused = compatible.find((vehicle) => !input.usedVehicleIds.has(vehicle.id));
    return unused ?? compatible[0] ?? null;
  }

  private cacheKey(tenantId: string, suggestionId: string) {
    return `${tenantId}:${suggestionId}`;
  }

  private evictExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.createdAt > DispatchSuggestionService.CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }
}

