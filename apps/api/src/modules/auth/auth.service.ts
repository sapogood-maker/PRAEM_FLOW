import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private getRequiredEnv(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET') {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  }

  private issueTokens(payload: JwtPayload) {
    return {
      access_token: this.jwtService.sign(payload, {
        secret: this.getRequiredEnv('JWT_SECRET'),
        expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      }),
      refresh_token: this.jwtService.sign(payload, {
        secret: this.getRequiredEnv('JWT_REFRESH_SECRET'),
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

  async refresh(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.getRequiredEnv('JWT_REFRESH_SECRET'),
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

