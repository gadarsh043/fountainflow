import { z } from 'zod';
import { FountainConfigSchema } from './create-project.dto';

export const UpdateProjectSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name cannot be empty')
      .max(200, 'Name too long')
      .trim()
      .optional(),
    fountain_config: FountainConfigSchema.optional(),
    status: z
      .enum(['draft', 'ready', 'archived'])
      .optional()
      .describe('Project status'),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update',
  );

export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;
