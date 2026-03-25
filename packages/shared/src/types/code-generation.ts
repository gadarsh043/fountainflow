/**
 * Code generation types — describes what gets generated for each target platform.
 */

import type { TargetPlatform } from './fountain-config';

export interface GeneratedFile {
  filename: string;
  content_type: 'text' | 'binary';
  /** For text files: the file content as a string */
  content?: string;
  /** For binary files: base64-encoded content */
  content_b64?: string;
  /** File size in bytes */
  size_bytes: number;
  description: string;
}

export interface GenerationResult {
  /** Target platform this was generated for */
  platform: TargetPlatform;
  /** All generated files to be included in the download ZIP */
  files: GeneratedFile[];
  /** README / setup instructions as markdown */
  readme: string;
  /** Wiring diagram SVG (if applicable) */
  wiring_diagram_svg?: string;
  /** Estimated storage required on target hardware in bytes */
  storage_required_bytes: number;
  /** Generation timestamp */
  generated_at: string;
}

/** Arduino/ESP32 binary show data frame format */
export interface BinaryFrameHeader {
  /** Magic bytes: "FFSHOW" */
  magic: string;
  /** Format version */
  version: number;
  /** Frames per second */
  frame_rate: number;
  /** Number of DMX channels per frame */
  channel_count: number;
  /** Total number of frames */
  frame_count: number;
}

/** DMX Art-Net binary file format */
export interface ArtNetFileHeader {
  /** Magic bytes: "FFSHOW" */
  magic: string;
  version: number;
  frame_rate: number;
  /** Number of DMX universes */
  universe_count: number;
  /** Total frame count */
  frame_count: number;
}

/** Job request sent from API to Python worker */
export interface ProcessJobRequest {
  job_id: string;
  project_id: string;
  audio_file_key: string;
  fountain_config: Record<string, unknown>;
  target_platforms: TargetPlatform[];
  /** Optional AI refinement of section theme assignments */
  use_ai_refinement: boolean;
}

/** Progress update emitted by worker during processing */
export interface JobProgressUpdate {
  job_id: string;
  stage: JobStage;
  progress_pct: number;
  message: string;
  timestamp: string;
}

export type JobStage =
  | 'queued'
  | 'downloading'
  | 'converting'
  | 'analyzing_beats'
  | 'analyzing_sections'
  | 'analyzing_energy'
  | 'detecting_boundaries'
  | 'generating_choreography'
  | 'generating_code'
  | 'generating_simulation'
  | 'packaging'
  | 'uploading'
  | 'completed'
  | 'failed';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/** Final job result stored in database */
export interface JobResult {
  job_id: string;
  status: JobStatus;
  /** S3 key for the audio analysis JSON */
  analysis_result_key?: string;
  /** S3 key for the show timeline JSON */
  timeline_key?: string;
  /** S3 key for the generated code ZIP */
  code_package_key?: string;
  /** S3 key for 3D simulation data (chunked JSON) */
  simulation_data_key?: string;
  /** Processing time in milliseconds */
  processing_time_ms?: number;
  /** Error message if failed */
  error_message?: string;
  completed_at?: string;
}
