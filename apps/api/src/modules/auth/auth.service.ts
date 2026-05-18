import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  name: string;
  driverId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private issueTokens(payload: JwtPayload) {
    const jwtSecret = process.env.JWT_SECRET ?? 'change_me_jwt';
    const refreshSecret = process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh';
    return {
      access_token: this.jwtService.sign(payload, {
        secret: jwtSecret,
        expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      }),
      refresh_token: this.jwtService.sign(payload, {
        secret: refreshSecret,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      }),
    };
  }

  async login(email: string, password: string) {
    if (!email || !password) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.user.findFirst({ where: { email, active: true } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    return {
      ...this.issueTokens(payload),
      user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId },
    };
  }

  /**
   * Driver login — used exclusively by the Flutter tablet terminal.
   * Validates that the User has role=DRIVER, upserts the Device record,
   * and returns the linked Driver + Vehicle so the app can start operating
   * immediately after login.
   */
  async driverLogin(
    email: string,
    password: string,
    deviceId?: string,
    platform?: string,
    appVersion?: string,
  ) {
    if (!email || !password) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.user.findFirst({
      where: { email, active: true, role: 'DRIVER' },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const driver = await this.prisma.driver.findFirst({
      where: { userId: user.id, tenantId: user.tenantId, active: true },
    });
    if (!driver) throw new UnauthorizedException('Driver profile not found');

    // Resolve vehicle: defaultVehicleId first, then latest route vehicle
    let vehicle: { id: string; plate: string; model: string; type: string; capacity: number } | null = null;
    if (driver.defaultVehicleId) {
      vehicle = await this.prisma.vehicle.findFirst({
        where: { id: driver.defaultVehicleId, active: true },
        select: { id: true, plate: true, model: true, type: true, capacity: true },
      });
    }
    if (!vehicle) {
      const lastRoute = await this.prisma.route.findFirst({
        where: { driverId: driver.id },
        orderBy: { date: 'desc' },
        select: { vehicle: { select: { id: true, plate: true, model: true, type: true, capacity: true } } },
      });
      vehicle = lastRoute?.vehicle ?? null;
    }

    // Upsert Device — auto-register the tablet on first login
    let device: { id: string; name: string; authToken: string | null; vehicleId: string | null } | null = null;
    if (deviceId) {
      const authToken = `dev_${randomUUID().replace(/-/g, '')}`;
      device = await this.prisma.device.upsert({
        where: { serialNumber: deviceId },
        create: {
          tenantId: user.tenantId,
          name: `Tablet ${user.name}`,
          serialNumber: deviceId,
          type: 'TABLET',
          platform: platform ?? 'android',
          driverId: driver.id,
          vehicleId: vehicle?.id ?? null,
          active: true,
          appVersion,
          authToken,
          lastSeenAt: new Date(),
        },
        update: {
          driverId: driver.id,
          ...(vehicle?.id ? { vehicleId: vehicle.id } : {}),
          active: true,
          lastSeenAt: new Date(),
          ...(appVersion ? { appVersion } : {}),
          ...(platform ? { platform } : {}),
        },
        select: { id: true, name: true, authToken: true, vehicleId: true },
      });
    }

    // Update last login timestamp
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      name: user.name,
      driverId: driver.id,
    };

    return {
      ...this.issueTokens(payload),
      driver: {
        id: driver.id,
        name: user.name,
        email: user.email,
        cnh: driver.cnh,
        status: driver.status,
        tenantId: driver.tenantId,
      },
      vehicle,
      device,
    };
  }

  async driverRefresh(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh',
      });
      if (decoded.role !== 'DRIVER') throw new UnauthorizedException('Not a driver token');
      return this.issueTokens({
        sub: decoded.sub,
        tenantId: decoded.tenantId,
        email: decoded.email,
        role: decoded.role,
        name: decoded.name,
        driverId: decoded.driverId,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async refresh(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh',
      });
      return this.issueTokens({
        sub: decoded.sub,
        tenantId: decoded.tenantId,
        email: decoded.email,
        role: decoded.role,
        name: decoded.name,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  logout() {
    return { success: true };
  }
}