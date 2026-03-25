import { z } from 'zod';

const configSchema = z.object({
  // Application
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  API_PORT: z.coerce.number().default(3001),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Storage
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),

  // Clerk
  CLERK_SECRET_KEY: z.string().startsWith('sk_'),

  // Processing limits
  MAX_SONG_DURATION_SECONDS: z.coerce.number().default(2700),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().default(200),

  // Python worker URL
  WORKER_URL: z.string().url().default('http://localhost:8001'),

  // Optional
  SENTRY_DSN: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = configSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }
  return result.data;
}

export default (): AppConfig => {
  return validateConfig(process.env as Record<string, unknown>);
};
