import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  /**
   * POST /auth/driver/login
   * Exclusive endpoint for Flutter tablet terminals (role=DRIVER only).
   * Auto-registers the device and returns driver + vehicle context.
   */
  @Post('driver/login')
  driverLogin(
    @Body()
    body: {
      email: string;
      password: string;
      deviceId?: string;
      platform?: string;
      appVersion?: string;
    },
  ) {
    return this.authService.driverLogin(
      body.email,
      body.password,
      body.deviceId,
      body.platform,
      body.appVersion,
    );
  }

  @Post('driver/refresh')
  driverRefresh(@Body() body: { refresh_token: string }) {
    return this.authService.driverRefresh(body.refresh_token);
  }

  @Post('refresh')
  refresh(@Body() body: { refresh_token: string }) {
    return this.authService.refresh(body.refresh_token);
  }

  @Post('logout')
  logout() {
    return this.authService.logout();
  }
}
