import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { JobsController } from './jobs.controller';
import { JobsService, FOUNTAIN_JOB_QUEUE } from './jobs.service';
import { JobsGateway } from './jobs.gateway';
import { JobsProcessor } from './jobs.processor';
import { ProjectsModule } from '../projects/projects.module';
import type { AppConfig } from '../config/configuration';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: FOUNTAIN_JOB_QUEUE,
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const redisUrl = config.get('REDIS_URL', { infer: true });
        // Parse redis URL: redis://[:password@]host:port[/db]
        const parsed = new URL(redisUrl);
        return {
          redis: {
            host: parsed.hostname,
            port: parseInt(parsed.port || '6379', 10),
            password: parsed.password || undefined,
            db: parseInt(parsed.pathname.replace('/', '') || '0', 10),
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { count: 100, age: 86400 }, // Keep last 100 or 24h
            removeOnFail: { count: 50 },
          },
        };
      },
      inject: [ConfigService],
    }),
    ProjectsModule,
  ],
  controllers: [JobsController],
  providers: [JobsService, JobsGateway, JobsProcessor],
  exports: [JobsService, JobsGateway],
})
export class JobsModule {}
