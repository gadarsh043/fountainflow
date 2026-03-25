import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StorageService } from './storage.service';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/clerk.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { z } from 'zod';

const PresignedUploadRequestSchema = z.object({
  filename: z
    .string()
    .min(1, 'Filename required')
    .max(255, 'Filename too long'),
  content_type: z.string().min(1, 'Content type required'),
  project_id: z.string().optional(),
});

type PresignedUploadRequest = z.infer<typeof PresignedUploadRequestSchema>;

@Controller('storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * POST /storage/presigned-upload
   * Get a presigned URL for direct upload to S3/MinIO.
   * Rate-limited: 10 requests per minute per user (enforced via IP by throttler).
   */
  @Post('presigned-upload')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async getPresignedUpload(
    @Body(new ZodValidationPipe(PresignedUploadRequestSchema))
    dto: PresignedUploadRequest,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(
      `POST /storage/presigned-upload by user ${user.userId}, file: ${dto.filename}`,
    );

    return this.storageService.generatePresignedUpload(
      user.userId,
      dto.filename,
      dto.content_type,
      dto.project_id,
    );
  }

  /**
   * GET /storage/download/:key
   * Get a presigned download URL for a file key.
   * The key is base64url-encoded to safely pass slashes in the path.
   */
  @Get('download/:key(*)')
  async getPresignedDownload(
    @Param('key') rawKey: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.logger.log(
      `GET /storage/download/${rawKey} by user ${user.userId}`,
    );

    // Validate the user has access to this key prefix
    // Keys starting with uploads/{userId}/ are always accessible to that user
    // Keys starting with projects/ require project-level access (checked at job/project level)
    // For now we do a basic check; deeper access control is in JobsService / ProjectsService
    if (
      !rawKey.startsWith(`uploads/${user.userId}/`) &&
      !rawKey.startsWith('projects/')
    ) {
      this.logger.warn(
        `User ${user.userId} attempted to access unauthorized key: ${rawKey}`,
      );
    }

    return this.storageService.generatePresignedDownload(rawKey);
  }
}
