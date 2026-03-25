import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { AppConfig } from '../config/configuration';

const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 900; // 15 minutes
const PRESIGNED_DOWNLOAD_EXPIRY_SECONDS = 3600; // 1 hour
const MAX_UPLOAD_SIZE_BYTES_LIMIT = 200 * 1024 * 1024; // 200 MB absolute cap

export interface PresignedUploadResult {
  upload_url: string;
  file_key: string;
  expires_in: number;
  max_size_bytes: number;
}

export interface PresignedDownloadResult {
  download_url: string;
  expires_in: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly maxUploadSizeBytes: number;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const endpoint = this.configService.get('S3_ENDPOINT', { infer: true });
    const region = this.configService.get('S3_REGION', { infer: true });
    const accessKeyId = this.configService.get('S3_ACCESS_KEY', {
      infer: true,
    });
    const secretAccessKey = this.configService.get('S3_SECRET_KEY', {
      infer: true,
    });

    this.bucket = this.configService.get('S3_BUCKET', { infer: true });

    const maxUploadSizeMb = this.configService.get('MAX_UPLOAD_SIZE_MB', {
      infer: true,
    });
    this.maxUploadSizeBytes = Math.min(
      maxUploadSizeMb * 1024 * 1024,
      MAX_UPLOAD_SIZE_BYTES_LIMIT,
    );

    this.s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      // Use custom endpoint for MinIO or localstack in dev
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });

    this.logger.log(
      `Storage service initialized — bucket: ${this.bucket}, endpoint: ${endpoint ?? 'AWS'}`,
    );
  }

  /**
   * Generate a presigned URL for direct client upload to S3/MinIO.
   * Returns both the URL and the S3 key so the caller can store it.
   */
  async generatePresignedUpload(
    userId: string,
    filename: string,
    contentType: string,
    projectId?: string,
  ): Promise<PresignedUploadResult> {
    this.logger.log(
      `Generating presigned upload URL for user ${userId}, file: ${filename}`,
    );

    this.validateFilename(filename);
    this.validateContentType(contentType);

    const ext = filename.split('.').pop() ?? 'bin';
    const uniqueId = uuidv4();
    const folder = projectId ? `projects/${projectId}` : `uploads/${userId}`;
    const fileKey = `${folder}/${uniqueId}.${ext}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        ContentType: contentType,
        ContentLength: this.maxUploadSizeBytes,
        Metadata: {
          'x-user-id': userId,
          'x-original-filename': encodeURIComponent(filename),
          ...(projectId ? { 'x-project-id': projectId } : {}),
        },
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
      });

      this.logger.log(`Presigned upload URL generated for key: ${fileKey}`);

      return {
        upload_url: uploadUrl,
        file_key: fileKey,
        expires_in: PRESIGNED_UPLOAD_EXPIRY_SECONDS,
        max_size_bytes: this.maxUploadSizeBytes,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned upload URL: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Failed to generate upload URL. Please try again.',
      );
    }
  }

  /**
   * Generate a presigned URL for downloading a file from S3/MinIO.
   */
  async generatePresignedDownload(
    fileKey: string,
  ): Promise<PresignedDownloadResult> {
    this.logger.log(`Generating presigned download URL for key: ${fileKey}`);

    // Verify the object exists before generating URL
    await this.assertObjectExists(fileKey);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
      });

      return {
        download_url: downloadUrl,
        expires_in: PRESIGNED_DOWNLOAD_EXPIRY_SECONDS,
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned download URL: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Failed to generate download URL. Please try again.',
      );
    }
  }

  /**
   * Delete an object from storage by key.
   */
  async deleteObject(fileKey: string): Promise<void> {
    this.logger.log(`Deleting object: ${fileKey}`);

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: fileKey,
        }),
      );
      this.logger.log(`Object deleted: ${fileKey}`);
    } catch (error) {
      this.logger.warn(
        `Failed to delete object ${fileKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't throw — best-effort deletion
    }
  }

  /**
   * Check if a file key belongs to a given user or project (access control).
   * Key format: projects/{projectId}/{uuid}.ext or uploads/{userId}/{uuid}.ext
   */
  assertKeyOwnership(fileKey: string, userId: string, projectId?: string): void {
    const validPrefixes: string[] = [`uploads/${userId}/`];
    if (projectId) {
      validPrefixes.push(`projects/${projectId}/`);
    }

    const isAuthorized = validPrefixes.some((prefix) =>
      fileKey.startsWith(prefix),
    );

    if (!isAuthorized) {
      throw new BadRequestException('Access denied to requested file');
    }
  }

  private async assertObjectExists(fileKey: string): Promise<void> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: fileKey }),
      );
    } catch (error) {
      const errorName =
        error instanceof Error ? error.name : 'UnknownError';

      if (
        errorName === 'NotFound' ||
        errorName === 'NoSuchKey' ||
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      ) {
        throw new BadRequestException(`File not found: ${fileKey}`);
      }

      throw new InternalServerErrorException(
        'Failed to verify file existence',
      );
    }
  }

  private validateFilename(filename: string): void {
    if (!filename || filename.length === 0) {
      throw new BadRequestException('Filename is required');
    }
    if (filename.length > 255) {
      throw new BadRequestException('Filename too long (max 255 characters)');
    }
    // Block path traversal
    if (filename.includes('..') || filename.includes('/')) {
      throw new BadRequestException('Invalid filename');
    }
  }

  private validateContentType(contentType: string): void {
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/x-wav',
      'audio/flac',
      'audio/aac',
      'audio/ogg',
      'audio/mp4',
      'audio/x-m4a',
    ];

    if (!allowedTypes.includes(contentType)) {
      throw new BadRequestException(
        `Content type "${contentType}" is not allowed. Supported types: ${allowedTypes.join(', ')}`,
      );
    }
  }
}
