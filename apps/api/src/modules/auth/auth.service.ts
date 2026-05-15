import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  login(email: string, password: string) {
    if (!email || !password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: 'demo-user', tenantId: 'demo-tenant', email, role: 'ADMIN_PREFEITURA' };

    return {
      access_token: this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET ?? 'change_me',
        expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
      }),
      refresh_token: this.jwtService.sign(payload, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh',
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
      }),
    };
  }

  refresh(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET ?? 'change_me_refresh',
      });
      return this.login(decoded.email, 'refresh');
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  logout() {
    return { success: true };
  }
}
