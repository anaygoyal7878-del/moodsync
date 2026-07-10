import { z } from 'zod';

/**
 * Fail fast on boot if required secrets are missing, rather than
 * discovering a misconfigured deploy the first time a request needs a
 * secret that was never set. Every other module reads config through this
 * validated object, never `process.env` directly.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TOKEN_TTL: z.string().default('15m'),
  JWT_REFRESH_TOKEN_TTL: z.string().default('30d'),

  OAUTH_TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, 'OAUTH_TOKEN_ENCRYPTION_KEY is required')
    .refine((key) => Buffer.from(key, 'base64').length === 32, {
      message: 'OAUTH_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32)',
    }),

  // Signs the short-lived state parameter used across every provider's
  // OAuth authorize->callback round trip (CSRF protection + carries the
  // PKCE code_verifier). Deliberately separate from the session JWT
  // secrets — a state token is a different trust category.
  OAUTH_STATE_SECRET: z.string().min(32, 'OAUTH_STATE_SECRET must be at least 32 characters'),

  WHOOP_CLIENT_ID: z.string().optional(),
  WHOOP_CLIENT_SECRET: z.string().optional(),
  WHOOP_REDIRECT_URI: z.string().optional(),

  HUE_CLIENT_ID: z.string().optional(),
  HUE_CLIENT_SECRET: z.string().optional(),
  HUE_REDIRECT_URI: z.string().optional(),

  GOOGLE_HEALTH_CLIENT_ID: z.string().optional(),
  GOOGLE_HEALTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_HEALTH_REDIRECT_URI: z.string().optional(),

  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  SPOTIFY_REDIRECT_URI: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
