import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationsGateway } from '../../gateways/operations.gateway';

@Controller('health')
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsGateway: OperationsGateway,
  ) {}

  @Get()
  check() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      service: 'praem-api',
    };
  }

  @Get('db')
  async checkDb() {
    const t0 = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latencyMs: Date.now() - t0 };
    } catch (err: any) {
      return { status: 'error', message: err?.message ?? 'DB unreachable', latencyMs: Date.now() - t0 };
    }
  }

  @Get('ws')
  checkWs() {
    return {
      status: 'ok',
      connectedClients: this.opsGateway.clientCount,
      namespace: '/operations',
    };
  }
}
