import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: { search?: string; status?: string; page?: number; limit?: number }) {
    const { search, status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: any = {
      tenantId,
      ...(status && { status: status as any }),
      ...(search && {
        user: { name: { contains: search, mode: 'insensitive' } },
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true } },
          devices: { where: { active: true }, select: { id: true, name: true, lastSeenAt: true, vehicleId: true } },
        },
        orderBy: { user: { name: 'asc' } },
      }),
      this.prisma.driver.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, tenantId: string) {
    const d = await this.prisma.driver.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true } },
        devices: { where: { active: true }, select: { id: true, name: true, lastSeenAt: true, vehicleId: true, platform: true } },
      },
    });
    if (!d) throw new NotFoundException('Driver not found');
    return d;
  }

  /**
   * Create a driver by first creating the User (role=DRIVER) then the Driver record.
   * Called by the admin dashboard to provision a new driver login.
   */
  async createWithUser(
    tenantId: string,
    data: {
      name: string;
      email: string;
      password: string;
      cnh: string;
      cnhExpiry: string;
      phone?: string;
      defaultVehicleId?: string;
    },
  ) {
    const existing = await this.prisma.user.findFirst({ where: { tenantId, email: data.email } });
    if (existing) throw new BadRequestException('Email already registered for this tenant');

    const hashed = await bcrypt.hash(data.password, 10);
    const cnhExpiry = new Date(data.cnhExpiry);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          name: data.name,
          email: data.email,
          password: hashed,
          role: 'DRIVER',
          phone: data.phone,
          active: true,
        },
      });

      const driver = await tx.driver.create({
        data: {
          tenantId,
          userId: user.id,
          cnh: data.cnh,
          cnhExpiry,
          active: true,
          status: 'OFFLINE',
          defaultVehicleId: data.defaultVehicleId ?? null,
        },
      });

      return {
        driver: { ...driver },
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      };
    });
  }

  async update(id: string, tenantId: string, data: any) {
    await this.findOne(id, tenantId);
    const sanitized = { ...data };
    // Convert date-only strings to Date objects for Prisma DateTime fields
    if (sanitized.cnhExpiry && typeof sanitized.cnhExpiry === 'string') {
      sanitized.cnhExpiry = new Date(sanitized.cnhExpiry);
    }
    // Strip operational fields — these must only be updated via heartbeat / WS events
    delete sanitized.wsLastSeenAt;
    delete sanitized.lastHeartbeatAt;
    delete sanitized.status;
    return this.prisma.driver.update({ where: { id }, data: sanitized });
  }

  /** Admin resets driver password. */
  async resetPassword(id: string, tenantId: string, newPassword: string) {
    const driver = await this.findOne(id, tenantId);
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: driver.user.id }, data: { password: hashed } });
    return { success: true };
  }

  /** Toggle driver active state (and linked User). */
  async setActive(id: string, tenantId: string, active: boolean) {
    const driver = await this.findOne(id, tenantId);
    await this.prisma.$transaction([
      this.prisma.driver.update({ where: { id }, data: { active } }),
      this.prisma.user.update({ where: { id: driver.user.id }, data: { active } }),
    ]);
    return { id, active };
  }

  /**
   * Returns all active drivers with their real operational status.
   * Derives wsConnected, gpsActive, and operationalStatus from timestamps —
   * NOT from the JWT login session.
   *
   * Thresholds:
   *   WS connected  : wsLastSeenAt within last 90 s
   *   GPS active    : lastHeartbeatAt within last 60 s
   *   OPERATIONAL   : wsConnected AND gpsActive
   */
  async getOnlineDrivers(tenantId: string) {
    const now = Date.now();
    const WS_THRESHOLD_MS  = 90_000;
    const GPS_THRESHOLD_MS = 60_000;

    const drivers = await this.prisma.driver.findMany({
      where: { tenantId, active: true },
      select: {
        id: true,
        status: true,
        wsLastSeenAt: true,
        lastHeartbeatAt: true,
        user: { select: { name: true, email: true } },
        devices: {
          where: { active: true, type: 'TABLET' },
          select: { id: true, vehicleId: true, lastSeenAt: true, appVersion: true, platform: true },
          orderBy: { lastSeenAt: 'desc' },
          take: 1,
        },
      },
    });

    return drivers.map(d => {
      const wsConnected  = d.wsLastSeenAt    ? (now - new Date(d.wsLastSeenAt).getTime())    < WS_THRESHOLD_MS  : false;
      const gpsActive    = d.lastHeartbeatAt ? (now - new Date(d.lastHeartbeatAt).getTime()) < GPS_THRESHOLD_MS : false;
      const operational  = wsConnected && gpsActive;

      const operationalStatus: string =
        operational         ? 'OPERATIONAL'  :
        wsConnected         ? 'CONNECTED'    :
        d.lastHeartbeatAt   ? 'GPS_LOST'     :
        d.wsLastSeenAt      ? 'WS_ONLY'      :
                              'OFFLINE';

      return {
        driverId: d.id,
        driverStatus: d.status,
        wsConnected,
        gpsActive,
        operationalStatus,
        wsLastSeenAt: d.wsLastSeenAt?.toISOString() ?? null,
        lastHeartbeatAt: d.lastHeartbeatAt?.toISOString() ?? null,
        user: d.user,
        device: d.devices[0] ?? null,
      };
    });
  }

  /** Called when the tablet WebSocket connects/joins the driver room. */
  async recordWsConnect(driverId: string, tenantId: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, tenantId } });
    if (!driver) return;
    try {
      await this.prisma.driver.update({ where: { id: driverId }, data: { wsLastSeenAt: new Date() } });
      this.logger.log(`[WS CONNECTED] driverId=${driverId} tenantId=${tenantId}`);
    } catch (err) {
      this.logger.error(`[WS CONNECTED] DB update failed for driverId=${driverId}: ${(err as Error).message}`);
    }
  }

  /** Called when a GPS heartbeat arrives (via WS or HTTP). */
  async recordHeartbeat(driverId: string, tenantId: string) {
    const driver = await this.prisma.driver.findFirst({ where: { id: driverId, tenantId } });
    if (!driver) return;
    try {
      await this.prisma.driver.update({
        where: { id: driverId },
        data: { lastHeartbeatAt: new Date(), wsLastSeenAt: new Date() },
      });
      this.logger.log(`[GPS HEARTBEAT] driverId=${driverId} tenantId=${tenantId}`);
    } catch (err) {
      this.logger.error(`[GPS HEARTBEAT] DB update failed for driverId=${driverId}: ${(err as Error).message}`);
    }
  }
}

