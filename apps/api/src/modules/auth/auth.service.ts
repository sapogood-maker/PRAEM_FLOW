import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  private getRequiredEnv(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET') {
    const value = process.env[name];
    if (!value) {
      throw new Error(`${name} is required`);
    }
    return value;
  }

  private issueTokens(payload: { sub: string; tenantId: string; email: string; role: string }) {
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

  login(email: string, password: string) {
    if (!email || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: 'demo-user', tenantId: 'demo-tenant', email, role: 'ADMIN_PREFEITURA' };

    return this.issueTokens(payload);
  }

  refresh(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.getRequiredEnv('JWT_REFRESH_SECRET'),
      });
      return this.issueTokens({
        sub: decoded.sub,
        tenantId: decoded.tenantId,
        email: decoded.email,
        role: decoded.role,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  logout() {
    return { success: true };
  }
}
