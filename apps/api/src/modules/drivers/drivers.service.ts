import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DriversService {
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
    return this.prisma.driver.update({ where: { id }, data });
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

  /** Returns online drivers — those with a Device seen within the last 90 seconds. */
  async getOnlineDrivers(tenantId: string) {
    const threshold = new Date(Date.now() - 90_000);
    const devices = await this.prisma.device.findMany({
      where: {
        tenantId,
        active: true,
        type: 'TABLET',
        driverId: { not: null },
        lastSeenAt: { gte: threshold },
      },
      select: {
        id: true,
        driverId: true,
        vehicleId: true,
        lastSeenAt: true,
        appVersion: true,
        platform: true,
        driver: {
          select: {
            id: true,
            status: true,
            user: { select: { name: true, email: true } },
          },
        },
      },
    });
    return devices;
  }
}

