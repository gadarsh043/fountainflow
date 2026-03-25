import { Process, Processor, OnQueueFailed, OnQueueActive } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bull';
import type { AppConfig } from '../config/configuration';
import { FOUNTAIN_JOB_QUEUE, type FountainJobPayload } from './jobs.service';

/**
 * Bull queue processor — bridge between NestJS Bull queue and the Python worker.
 *
 * Flow:
 *   1. NestJS API enqueues job to Bull → Bull calls @Process('process-fountain')
 *   2. This processor makes one HTTP POST to the Python worker FastAPI endpoint
 *   3. Python worker enqueues a Celery task and returns 202 immediately
 *   4. Celery task runs the pipeline and POSTs progress back to /jobs/:id/callback
 */
@Processor(FOUNTAIN_JOB_QUEUE)
export class JobsProcessor {
  private readonly logger = new Logger(JobsProcessor.name);
  private readonly workerUrl: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.workerUrl = this.configService.get('WORKER_URL', { infer: true });
  }

  @Process('process-fountain')
  async handleFountainJob(bullJob: Job<FountainJobPayload>): Promise<void> {
    const {
      job_id,
      project_id,
      audio_file_key,
      fountain_config,
      options,
      callback_url,
    } = bullJob.data;

    this.logger.log(
      `Forwarding job ${job_id} to Python worker at ${this.workerUrl}`,
    );

    // Extract target_platforms from fountain_config (set by the config wizard)
    const config = fountain_config as Record<string, unknown>;
    const rawPlatforms = config?.target_platforms as string[] | string | undefined;
    const targetPlatforms: string[] = Array.isArray(rawPlatforms)
      ? rawPlatforms
      : typeof rawPlatforms === 'string'
        ? [rawPlatforms, 'json_timeline']
        : ['json_timeline'];

    // The worker needs the callback URL to POST progress back to NestJS
    // Strip /jobs/:id/callback from callback_url to get the api base URL
    const workerCallbackBase = callback_url
      ? callback_url.replace(/\/jobs\/[^/]+\/callback$/, '')
      : undefined;

    const workerPayload = {
      job_id,
      project_id,
      audio_file_key,
      fountain_config: config,
      target_platforms: targetPlatforms,
      use_ai_refinement: false, // Ollama/Claude refinement: future feature
      api_callback_url: workerCallbackBase,
    };

    const response = await fetch(
      `${this.workerUrl}/jobs/${job_id}/process`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workerPayload),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Python worker rejected job ${job_id} — HTTP ${response.status}: ${body}`,
      );
    }

    this.logger.log(
      `Job ${job_id} accepted by Python worker (202 Accepted)`,
    );
  }

  @OnQueueActive()
  onActive(bullJob: Job): void {
    this.logger.log(
      `Bull job ${bullJob.id} active — attempt ${bullJob.attemptsMade + 1}`,
    );
  }

  @OnQueueFailed()
  onFailed(bullJob: Job, error: Error): void {
    this.logger.error(
      `Bull job ${bullJob.id} failed after ${bullJob.attemptsMade} attempts: ${error.message}`,
    );
  }
}
