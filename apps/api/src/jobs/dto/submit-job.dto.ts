import { z } from 'zod';

export const SubmitJobSchema = z.object({
  project_id: z.string().min(1, 'project_id is required'),
  audio_file_key: z
    .string()
    .min(1, 'audio_file_key is required')
    .describe('S3 key of the uploaded audio file'),
  options: z
    .object({
      target_duration_seconds: z
        .number()
        .positive()
        .max(2700, 'Max duration 45 minutes')
        .optional(),
      choreography_style: z
        .enum(['energetic', 'calm', 'dramatic', 'synchronized'])
        .optional()
        .default('synchronized'),
      enable_lighting: z.boolean().optional().default(false),
      enable_color: z.boolean().optional().default(false),
      beat_sensitivity: z
        .number()
        .min(0.1)
        .max(2.0)
        .optional()
        .default(1.0)
        .describe('Multiplier for beat detection sensitivity'),
      section_themes: z
        .array(
          z.object({
            start_time_seconds: z.number().nonnegative(),
            end_time_seconds: z.number().positive(),
            theme: z.enum([
              'low',
              'medium',
              'high',
              'explosive',
              'calm',
              'custom',
            ]),
            custom_description: z.string().max(500).optional(),
          }),
        )
        .optional()
        .describe('Optional user-defined section themes'),
    })
    .optional()
    .default({}),
});

export type SubmitJobDto = z.infer<typeof SubmitJobSchema>;

export interface JobStatusResponse {
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
}

export interface JobProgressEvent {
  job_id: string;
  stage: string;
  progress_pct: number;
  message: string;
}

export interface JobCompletedEvent {
  job_id: string;
  result: {
    timeline_key: string | null;
    code_package_key: string | null;
    simulation_data_key: string | null;
    processing_time_ms: number | null;
  };
}

export interface JobFailedEvent {
  job_id: string;
  error: string;
}
