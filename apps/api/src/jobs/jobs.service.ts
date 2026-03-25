import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from '../projects/projects.service';
import { JobsGateway } from './jobs.gateway';
import type { AuthenticatedUser } from '../auth/clerk.guard';
import type { SubmitJobDto, JobStatusResponse } from './dto/submit-job.dto';

export const FOUNTAIN_JOB_QUEUE = 'fountain-jobs';

export interface FountainJobPayload {
  job_id: string;
  project_id: string;
  user_id: string;
  audio_file_key: string;
  fountain_config: unknown;
  options: SubmitJobDto['options'];
  callback_url: string;
}

// Payload shape for the worker callback webhook
export interface WorkerProgressCallback {
  job_id: string;
  status:
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled';
  stage?: string;
  progress_pct?: number;
  message?: string;
  analysis_result_key?: string;
  timeline_key?: string;
  code_package_key?: string;
  simulation_data_key?: string;
  processing_time_ms?: number;
  error_message?: string;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly jobsGateway: JobsGateway,
    @InjectQueue(FOUNTAIN_JOB_QUEUE)
    private readonly jobQueue: Queue<FountainJobPayload>,
  ) {}

  async submitJob(
    dto: SubmitJobDto,
    user: AuthenticatedUser,
    apiBaseUrl: string,
  ): Promise<JobStatusResponse> {
    this.logger.log(
      `Submitting job for project ${dto.project_id} by user ${user.userId}`,
    );

    // Verify project exists and user has access
    const project = await this.projectsService.findOne(
      dto.project_id,
      user,
    );

    // Don't allow submitting a new job if project is archived
    if (project.status === 'archived') {
      throw new BadRequestException(
        'Cannot submit a job for an archived project',
      );
    }

    // Check for an already-running job on this project
    const activeJob = await this.prisma.job.findFirst({
      where: {
        project_id: dto.project_id,
        status: { in: ['pending', 'running'] },
      },
    });

    if (activeJob) {
      throw new BadRequestException(
        `Project already has an active job (${activeJob.id}). Wait for it to complete or cancel it first.`,
      );
    }

    // Create job record in DB
    const job = await this.prisma.job.create({
      data: {
        project_id: dto.project_id,
        status: 'pending',
        audio_file_key: dto.audio_file_key,
      },
    });

    this.logger.log(`Job record created: ${job.id}`);

    // Build callback URL so the Python worker can POST progress back
    const callbackUrl = `${apiBaseUrl}/jobs/${job.id}/callback`;

    // Dispatch to BullMQ
    const queueJob = await this.jobQueue.add(
      'process-fountain',
      {
        job_id: job.id,
        project_id: dto.project_id,
        user_id: user.userId,
        audio_file_key: dto.audio_file_key,
        fountain_config: project.fountain_config,
        options: dto.options,
        callback_url: callbackUrl,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: false,
        removeOnFail: false,
        jobId: job.id, // Use our DB job ID as Bull job ID
      },
    );

    this.logger.log(
      `Job ${job.id} dispatched to queue (Bull job ID: ${queueJob.id})`,
    );

    // Mark project as having an active job
    await this.prisma.project.update({
      where: { id: dto.project_id },
      data: { status: 'processing' },
    });

    return this.mapToResponse(job);
  }

  async getJobStatus(
    jobId: string,
    user: AuthenticatedUser,
  ): Promise<JobStatusResponse> {
    const job = await this.findJobWithAccess(jobId, user);
    return this.mapToResponse(job);
  }

  async cancelJob(
    jobId: string,
    user: AuthenticatedUser,
  ): Promise<JobStatusResponse> {
    this.logger.log(`Cancelling job ${jobId} by user ${user.userId}`);

    const job = await this.findJobWithAccess(jobId, user);

    if (!['pending', 'running'].includes(job.status)) {
      throw new BadRequestException(
        `Job ${jobId} cannot be cancelled — current status: ${job.status}`,
      );
    }

    // Remove from Bull queue if still pending
    try {
      const bullJob = await this.jobQueue.getJob(jobId);
      if (bullJob) {
        await bullJob.remove();
        this.logger.log(
          `Bull job ${jobId} removed from queue`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to remove Bull job ${jobId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Update DB record
    const updated = await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'cancelled',
        error_message: 'Cancelled by user',
        completed_at: new Date(),
      },
    });

    // Reset project status
    await this.prisma.project.update({
      where: { id: job.project_id },
      data: { status: 'draft' },
    });

    // Emit WebSocket event
    this.jobsGateway.emitJobFailed(user.userId, {
      job_id: jobId,
      error: 'Cancelled by user',
    });

    return this.mapToResponse(updated);
  }

  /**
   * Handle progress callback from the Python worker.
   * The worker POSTs to /jobs/:id/callback with WorkerProgressCallback.
   */
  async handleWorkerCallback(
    jobId: string,
    payload: WorkerProgressCallback,
  ): Promise<void> {
    this.logger.log(
      `Worker callback for job ${jobId}: status=${payload.status}, stage=${payload.stage ?? ''}, progress=${payload.progress_pct ?? 0}%`,
    );

    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { project: true },
    });

    if (!job) {
      this.logger.warn(
        `Worker callback for unknown job ${jobId} — ignoring`,
      );
      return;
    }

    const userId = job.project.user_id;
    const now = new Date();

    switch (payload.status) {
      case 'running': {
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'running',
            stage: payload.stage,
            progress_pct: payload.progress_pct ?? job.progress_pct,
            ...(payload.analysis_result_key
              ? { analysis_result_key: payload.analysis_result_key }
              : {}),
          },
        });

        this.jobsGateway.emitJobProgress(userId, {
          job_id: jobId,
          stage: payload.stage ?? 'processing',
          progress_pct: payload.progress_pct ?? 0,
          message: payload.message ?? '',
        });
        break;
      }

      case 'completed': {
        const completedAt = now;
        const processingTimeMs = payload.processing_time_ms;

        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            stage: 'done',
            progress_pct: 100,
            analysis_result_key: payload.analysis_result_key,
            timeline_key: payload.timeline_key,
            code_package_key: payload.code_package_key,
            simulation_data_key: payload.simulation_data_key,
            processing_time_ms: processingTimeMs,
            completed_at: completedAt,
          },
        });

        // Update project status back to ready
        await this.prisma.project.update({
          where: { id: job.project_id },
          data: { status: 'ready' },
        });

        this.jobsGateway.emitJobCompleted(userId, {
          job_id: jobId,
          result: {
            timeline_key: payload.timeline_key ?? null,
            code_package_key: payload.code_package_key ?? null,
            simulation_data_key: payload.simulation_data_key ?? null,
            processing_time_ms: processingTimeMs ?? null,
          },
        });
        break;
      }

      case 'failed': {
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'failed',
            error_message: payload.error_message ?? 'Unknown error',
            completed_at: now,
          },
        });

        // Reset project status
        await this.prisma.project.update({
          where: { id: job.project_id },
          data: { status: 'draft' },
        });

        this.jobsGateway.emitJobFailed(userId, {
          job_id: jobId,
          error: payload.error_message ?? 'Processing failed',
        });
        break;
      }

      case 'cancelled': {
        await this.prisma.job.update({
          where: { id: jobId },
          data: {
            status: 'cancelled',
            error_message: 'Cancelled by worker',
            completed_at: now,
          },
        });
        break;
      }

      default:
        this.logger.warn(
          `Unknown worker status "${payload.status}" for job ${jobId}`,
        );
    }
  }

  private async findJobWithAccess(
    jobId: string,
    user: AuthenticatedUser,
  ) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { project: true },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    // Check access via project ownership
    const isOwner = job.project.user_id === user.userId;
    const isOrgMember =
      user.orgId !== null &&
      job.project.org_id !== null &&
      job.project.org_id === user.orgId;

    if (!isOwner && !isOrgMember) {
      throw new ForbiddenException('Access denied to this job');
    }

    return job;
  }

  private mapToResponse(job: {
    id: string;
    project_id: string;
    status: string;
    stage: string | null;
    progress_pct: number;
    audio_file_key: string | null;
    analysis_result_key: string | null;
    timeline_key: string | null;
    code_package_key: string | null;
    simulation_data_key: string | null;
    processing_time_ms: number | null;
    error_message: string | null;
    created_at: Date;
    updated_at: Date;
    completed_at: Date | null;
  }): JobStatusResponse {
    return {
      id: job.id,
      project_id: job.project_id,
      status: job.status,
      stage: job.stage,
      progress_pct: job.progress_pct,
      audio_file_key: job.audio_file_key,
      analysis_result_key: job.analysis_result_key,
      timeline_key: job.timeline_key,
      code_package_key: job.code_package_key,
      simulation_data_key: job.simulation_data_key,
      processing_time_ms: job.processing_time_ms,
      error_message: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at,
      completed_at: job.completed_at,
    };
  }
}
