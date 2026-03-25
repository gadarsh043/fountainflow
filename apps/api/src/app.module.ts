import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { JobsModule } from './jobs/jobs.module';
import { StorageModule } from './storage/storage.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ── Config ──────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'], // Check local then monorepo root
      cache: true,
    }),

    // ── Rate Limiting ────────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        // Global default: 100 requests per minute per IP
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // ── Database ─────────────────────────────────────────────────────────────
    PrismaModule,

    // ── Feature Modules ───────────────────────────────────────────────────────
    AuthModule,
    ProjectsModule,
    JobsModule,
    StorageModule,
    HealthModule,
  ],
  providers: [
    // Apply throttler globally (individual endpoints can override with @Throttle)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
