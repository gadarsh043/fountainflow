import { z } from 'zod';

// Fountain nozzle configuration
const NozzleConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['jet', 'fan', 'ring', 'mist', 'arch', 'custom']),
  max_height_m: z.number().positive().max(50),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number().default(0),
  }),
  color_capable: z.boolean().default(false),
  lighting_capable: z.boolean().default(false),
});

// Full fountain configuration
export const FountainConfigSchema = z.object({
  nozzles: z.array(NozzleConfigSchema).min(1).max(500),
  pool_shape: z.enum(['circular', 'rectangular', 'custom']).optional(),
  pool_dimensions: z
    .object({
      width_m: z.number().positive().optional(),
      length_m: z.number().positive().optional(),
      diameter_m: z.number().positive().optional(),
    })
    .optional(),
  has_lighting: z.boolean().default(false),
  has_color: z.boolean().default(false),
  max_flow_rate_lps: z.number().positive().optional(),
  music_bpm_hint: z.number().positive().max(300).optional(),
});

export type FountainConfig = z.infer<typeof FountainConfigSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long').trim(),
  fountain_config: FountainConfigSchema,
});

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;

// Response type
export interface ProjectResponse {
  id: string;
  name: string;
  user_id: string;
  org_id: string | null;
  status: string;
  fountain_config: FountainConfig;
  created_at: Date;
  updated_at: Date;
}
