import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  Headers,
} from '@nestjs/common';
import type { Request } from 'express';
import { JobsService } from './jobs.service';
import type { WorkerProgressCallback } from './jobs.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import type { AuthenticatedUser } from '../auth/clerk.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  SubmitJobSchema,
  type SubmitJobDto,
  type JobStatusResponse,
} from './dto/submit-job.dto';
import { z } from 'zod';

const WorkerCallbackSchema = z.object({
  job_id: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  stage: z.string().optional(),
  progress_pct: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  analysis_result_key: z.string().optional(),
  timeline_key: z.string().optional(),
  code_package_key: z.string().optional(),
  simulation_data_key: z.string().optional(),
  processing_time_ms: z.number().positive().optional(),
  error_message: z.string().optional(),
});

@Controller('jobs')
export class JobsController {
  private readonly logger = new Logger(JobsController.name);

  constructor(private readonly jobsService: JobsService) {}

  /**
   * POST /jobs
   * Submit a new analysis + choreography job.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submitJob(
    @Body(new ZodValidationPipe(SubmitJobSchema)) dto: SubmitJobDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<JobStatusResponse> {
    this.logger.log(
      `POST /jobs for project ${dto.project_id} by user ${user.userId}`,
    );

    // Derive the API base URL from the incoming request
    const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

    return this.jobsService.submitJob(dto, user, apiBaseUrl);
  }

  /**
   * GET /jobs/:id
   * Get the current status of a job.
   */
  @Get(':id')
  async getJobStatus(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobStatusResponse> {
    this.logger.log(`GET /jobs/${id} by user ${user.userId}`);
    return this.jobsService.getJobStatus(id, user);
  }

  /**
   * DELETE /jobs/:id
   * Cancel a pending or running job.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async cancelJob(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobStatusResponse> {
    this.logger.log(`DELETE /jobs/${id} by user ${user.userId}`);
    return this.jobsService.cancelJob(id, user);
  }

  /**
   * POST /jobs/:id/callback
   * Internal endpoint for the Python worker to report job progress.
   * Protected by a shared secret header, NOT Clerk JWT.
   */
  @Post(':id/callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  async workerCallback(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(WorkerCallbackSchema))
    payload: WorkerProgressCallback,
    @Headers('x-worker-secret') workerSecret: string | undefined,
  ): Promise<{ ok: boolean }> {
    this.logger.debug(
      `POST /jobs/${id}/callback: status=${payload.status}`,
    );

    // Validate shared worker secret (set via WORKER_SECRET env var)
    const expectedSecret = process.env['WORKER_SECRET'];
    if (expectedSecret && workerSecret !== expectedSecret) {
      this.logger.warn(
        `Callback rejected for job ${id} — invalid worker secret`,
      );
      return { ok: false };
    }

    // The payload job_id should match the URL param
    if (payload.job_id !== id) {
      this.logger.warn(
        `Callback job_id mismatch: URL=${id}, body=${payload.job_id}`,
      );
    }

    await this.jobsService.handleWorkerCallback(id, payload);
    return { ok: true };
  }
}
