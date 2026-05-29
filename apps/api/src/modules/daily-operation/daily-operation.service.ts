import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Default shifts created when bootstrapping a new operation. */
const DEFAULT_SHIFTS = [
  { name: 'MANHÃ',  startTime: '06:00', endTime: '12:00' },
  { name: 'TARDE',  startTime: '12:00', endTime: '18:00' },
  { name: 'NOITE',  startTime: '18:00', endTime: '00:00' },
];

@Injectable()
export class DailyOperationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.operation.findMany({
      where: { tenantId },
      include: { shifts: true },
      orderBy: { date: 'desc' },
      take: 30,
    });
  }

  /**
   * Returns today's operation for the tenant.
   * If none exists, auto-bootstraps: creates the Operation (PENDING_DISPATCH),
   * creates 3 default shifts, and enriches the result with live operational counters.
   */
  async findToday(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let operation = await this.prisma.operation.findFirst({
      where: { tenantId, date: today },
      include: { shifts: true },
    });

    if (!operation) {
      operation = await this._bootstrap(tenantId, today);
    }

    // Enrich with live counts so the dashboard never shows stale zeros.
    const live = await this._liveCounters(tenantId, today);
    return { ...operation, ...live };
  }

  async create(tenantId: string, data: { date: string; notes?: string }) {
    const date = new Date(data.date);
    date.setHours(0, 0, 0, 0);
    return this.prisma.operation.create({
      data: { tenantId, date, notes: data.notes, status: 'IMPORTED' as any },
      include: { shifts: true },
    });
  }

  async updateStatus(id: string, tenantId: string, status: string) {
    const op = await this.prisma.operation.findFirst({ where: { id, tenantId } });
    if (!op) throw new NotFoundException('Operation not found');
    return this.prisma.operation.update({ where: { id }, data: { status: status as any } });
  }

  /**
   * Bootstrap all tenants — called by the daily cron at 00:01.
   * Creates today's Operation + shifts for every tenant that doesn't have one yet.
   */
  async bootstrapAllTenants(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tenants = await this.prisma.tenant.findMany({
      where: { active: true },
      select: { id: true },
    });

    await Promise.all(
      tenants.map(async ({ id: tenantId }: { id: string }) => {
        const existing = await this.prisma.operation.findFirst({
          where: { tenantId, date: today },
        });
        if (!existing) {
          await this._bootstrap(tenantId, today);
        }
      }),
    );
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private async _bootstrap(tenantId: string, date: Date) {
    const operation = await this.prisma.operation.create({
      data: {
        tenantId,
        date,
        status: 'PENDING_DISPATCH' as any,
        createdAutomatically: true,
        shifts: {
          create: DEFAULT_SHIFTS.map((s) => ({ ...s, tenantId, status: 'PENDING' })),
        },
      },
      include: { shifts: true },
    });
    return operation;
  }

  private async _liveCounters(tenantId: string, today: Date) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [activeVehicles, activeDrivers, waitingPatients, activeRoutes] = await Promise.all([
      this.prisma.vehicle.count({ where: { tenantId, active: true, status: { in: ['AVAILABLE', 'ON_ROUTE', 'BOARDING', 'WAITING'] } } }),
      this.prisma.driver.count({ where: { tenantId, active: true, status: { in: ['AVAILABLE', 'ON_ROUTE'] } } }),
      this.prisma.operationalQueue.count({ where: { tenantId, status: { in: ['WAITING_DISPATCH', 'WAITING', 'CONFIRMED', 'ASSIGNED'] } } }),
      this.prisma.operation.count({ where: { tenantId, status: { in: ['DISPATCHED', 'CONFIRMED', 'BOARDING', 'IN_TRANSIT', 'ARRIVED'] as any[] } } }),
    ]);

    return {
      totalVehicles: activeVehicles,
      totalDrivers: activeDrivers,
      totalPatients: waitingPatients,
      totalRoutes: activeRoutes,
    };
  }
}
