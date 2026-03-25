/**
 * Typed API client for FountainFlow.
 * All calls go through the Next.js proxy routes (apps/web/app/api/).
 * The proxy routes forward requests to the NestJS API server.
 */

import type {
  FountainConfig,
  JobProgressUpdate,
  JobResult,
  JobStatus,
  JobStage,
} from '@fountainflow/shared';

// ---------------------------------------------------------------------------
// Types for API request/response bodies
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  user_id: string;
  name: string;
  fountain_config: FountainConfig;
  status: 'draft' | 'ready' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  /** Current job if one is running or completed */
  current_job?: Job;
}

export interface Job {
  id: string;
  project_id: string;
  status: JobStatus;
  stage: JobStage;
  progress_pct: number;
  message: string;
  audio_file_key?: string;
  /** S3 key for download ZIP */
  code_package_key?: string;
  /** S3 key for timeline JSON */
  timeline_key?: string;
  /** S3 key for simulation data */
  simulation_data_key?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  result?: JobResult;
}

export interface CreateProjectRequest {
  name: string;
  fountain_config: Omit<FountainConfig, 'id' | 'created_at' | 'updated_at'>;
}

export interface UpdateProjectRequest {
  name?: string;
  fountain_config?: Partial<FountainConfig>;
}

export interface CreateJobRequest {
  project_id: string;
  audio_file_key: string;
  target_platforms?: string[];
  use_ai_refinement?: boolean;
}

export interface PresignedUploadResponse {
  upload_url: string;
  file_key: string;
  expires_in_seconds: number;
  fields?: Record<string, string>;
}

export interface PresignedDownloadResponse {
  download_url: string;
  expires_in_seconds: number;
}

export interface PaginatedProjects {
  projects: Project[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// API error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Base fetch helper
// ---------------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { code?: string; message?: string };
      code = body.code ?? code;
      message = body.message ?? message;
    } catch {
      // Body wasn't JSON — use default message
    }
    throw new ApiError(response.status, code, message);
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projectsApi = {
  list(page = 1, pageSize = 20, search?: string): Promise<PaginatedProjects> {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
    });
    if (search) params.set('search', search);
    return apiFetch<PaginatedProjects>(`/api/projects?${params.toString()}`);
  },

  get(id: string): Promise<Project> {
    return apiFetch<Project>(`/api/projects/${id}`);
  },

  create(body: CreateProjectRequest): Promise<Project> {
    return apiFetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  update(id: string, body: UpdateProjectRequest): Promise<Project> {
    return apiFetch<Project>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  delete(id: string): Promise<void> {
    return apiFetch<void>(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  },
};

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const jobsApi = {
  create(body: CreateJobRequest): Promise<Job> {
    return apiFetch<Job>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  get(id: string): Promise<Job> {
    return apiFetch<Job>(`/api/jobs/${id}`);
  },

  cancel(id: string): Promise<void> {
    return apiFetch<void>(`/api/jobs/${id}/cancel`, {
      method: 'POST',
    });
  },
};

// ---------------------------------------------------------------------------
// Storage / presigned URLs
// ---------------------------------------------------------------------------

export const storageApi = {
  getPresignedUpload(filename: string, contentType: string, projectId: string): Promise<PresignedUploadResponse> {
    return apiFetch<PresignedUploadResponse>('/api/storage/presigned-upload', {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType, project_id: projectId }),
    });
  },

  /** Upload a file directly to S3 using a presigned URL. Returns the final file key. */
  async uploadToS3(
    file: File,
    presigned: PresignedUploadResponse,
    onProgress?: (pct: number) => void,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const pct = Math.round((event.loaded / event.total) * 100);
          onProgress(pct);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(presigned.file_key);
        } else {
          reject(new ApiError(xhr.status, 'S3_UPLOAD_FAILED', `S3 upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new ApiError(0, 'NETWORK_ERROR', 'Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new ApiError(0, 'UPLOAD_ABORTED', 'Upload was aborted'));
      });

      // If presigned.fields exist, use multipart form (AWS S3 POST policy)
      if (presigned.fields && Object.keys(presigned.fields).length > 0) {
        const formData = new FormData();
        for (const [key, value] of Object.entries(presigned.fields)) {
          formData.append(key, value);
        }
        formData.append('file', file);
        xhr.open('POST', presigned.upload_url);
        xhr.send(formData);
      } else {
        // Simple PUT upload
        xhr.open('PUT', presigned.upload_url);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      }
    });
  },
};

// ---------------------------------------------------------------------------
// Progress update helpers
// ---------------------------------------------------------------------------

export function isTerminalStage(stage: JobStage): boolean {
  return stage === 'completed' || stage === 'failed';
}

export function stageToLabel(stage: JobStage): string {
  const labels: Record<JobStage, string> = {
    queued: 'Queued',
    downloading: 'Downloading audio',
    converting: 'Converting to WAV',
    analyzing_beats: 'Analyzing beats',
    analyzing_sections: 'Detecting sections',
    analyzing_energy: 'Analyzing frequency bands',
    detecting_boundaries: 'Detecting song boundaries',
    generating_choreography: 'Generating choreography',
    generating_code: 'Generating control code',
    generating_simulation: 'Building 3D simulation',
    packaging: 'Packaging downloads',
    uploading: 'Uploading results',
    completed: 'Completed',
    failed: 'Failed',
  };
  return labels[stage] ?? stage;
}

export function progressUpdateToJob(update: JobProgressUpdate): Partial<Job> {
  return {
    id: update.job_id,
    stage: update.stage,
    progress_pct: update.progress_pct,
    message: update.message,
    status: update.stage === 'completed' ? 'completed' : update.stage === 'failed' ? 'failed' : 'processing',
    updated_at: update.timestamp,
  };
}
