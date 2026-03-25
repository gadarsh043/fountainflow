import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  HealthCheckResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { FOUNTAIN_JOB_QUEUE } from '../jobs/jobs.service';
import { JobsGateway } from '../jobs/jobs.gateway';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
    @InjectQueue(FOUNTAIN_JOB_QUEUE) private readonly jobQueue: Queue,
    private readonly jobsGateway: JobsGateway,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      // Database connectivity
      async () =>
        this.prismaHealth.pingCheck('database', this.prisma),

      // Memory usage (warn above 500 MB heap)
      async () =>
        this.memory.checkHeap('memory_heap', 500 * 1024 * 1024),

      // Redis / Bull queue connectivity
      async () => {
        try {
          const client = await this.jobQueue.client;
          await client.ping();
          return { redis: { status: 'up' } };
        } catch {
          return { redis: { status: 'down' } };
        }
      },
    ]);
  }

  @Get('info')
  @Public()
  info() {
    return {
      service: 'FountainFlow API',
      version: process.env['npm_package_version'] ?? '0.1.0',
      environment: process.env['NODE_ENV'] ?? 'development',
      uptime_seconds: Math.floor(process.uptime()),
      connected_ws_users: this.jobsGateway.getConnectedUserCount(),
      timestamp: new Date().toISOString(),
    };
  }
}
