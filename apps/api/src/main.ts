import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  Logger,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';

class SocketIoAdapter extends IoAdapter {
  createIOServer(
    port: number,
    options?: ServerOptions & { namespace?: string; server?: unknown },
  ) {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: process.env['CORS_ORIGINS']?.split(',') ?? [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://localhost:3002',
        ],
        credentials: true,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return server;
  }
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error', 'debug', 'verbose'],
    bufferLogs: true,
  });

  const configService = app.get(ConfigService<AppConfig, true>);
  const port = configService.get('API_PORT', { infer: true });
  const nodeEnv = configService.get('NODE_ENV', { infer: true });
  const isProd = nodeEnv === 'production';

  // ── CORS ───────────────────────────────────────────────────────────────────
  const corsOrigins = process.env['CORS_ORIGINS']?.split(',') ?? [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:5173', // Vite dev server
  ];

  app.enableCors({
    origin: isProd ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-worker-secret',
      'x-user-id',
    ],
  });

  // ── WebSocket Adapter ──────────────────────────────────────────────────────
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  // ── Global Prefix ──────────────────────────────────────────────────────────
  // All routes prefixed with /api except /health and /ws
  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/info'],
  });

  // ── Global Interceptors ────────────────────────────────────────────────────
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));

  // ── Trust Proxy (for correct IP behind load balancer) ─────────────────────
  app.set('trust proxy', 1);

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');

  logger.log(
    `FountainFlow API running on http://0.0.0.0:${port} [${nodeEnv}]`,
  );
  logger.log(`WebSocket gateway: ws://0.0.0.0:${port}/ws`);
  logger.log(`Health check:      http://0.0.0.0:${port}/health`);
}

void bootstrap();
