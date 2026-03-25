import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [
    TerminusModule,
    JobsModule, // For queue injection and JobsGateway
  ],
  controllers: [HealthController],
})
export class HealthModule {}
