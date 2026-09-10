import { z } from 'zod';

/** Coerce common truthy strings to boolean (z.coerce.boolean treats "false" as true). */
const boolish = (def: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v))
    .default(def);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(604800),
  // Grace window (seconds) in which re-presenting an ALREADY ROTATED refresh
  // token is read as two tabs/requests racing, not as theft. Outside it, a
  // replay still nukes the family. 0 restores the strict (intolerant) behaviour.
  REFRESH_REUSE_GRACE: z.coerce.number().default(10),

  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: boolish(false),
  CSRF_SECRET: z.string().min(16),

  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().default('http://localhost:3001'),

  TOTP_ISSUER: z.string().default('DontPanic'),
  // true: 2FA is mandatory — users must set it up right after verifying email
  // and can't use the app without it. false: a snoozable prompt on first login.
  TWO_FACTOR_REQUIRED: boolish(false),

  // --- drivers (hexagonal) ---
  STORAGE_DRIVER: z.enum(['s3', 'local']).default('s3'),
  MAIL_DRIVER: z.enum(['smtp', 'ses', 'console']).default('smtp'),
  CACHE_DRIVER: z.enum(['redis', 'memory']).default('redis'),
  DB_PROVIDER: z.enum(['postgresql', 'mysql', 'sqlite']).default('postgresql'),

  // --- mail ---
  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().default(1025),
  MAIL_SECURE: boolish(false),
  MAIL_USER: z.string().default(''),
  MAIL_PASSWORD: z.string().default(''),
  MAIL_FROM: z.string().default('DontPanic <no-reply@dontpanic.dev>'),

  // --- s3 / minio ---
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('dontpanic'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_FORCE_PATH_STYLE: boolish(true),
  S3_PUBLIC_URL: z.string().default('http://localhost:9000/dontpanic'),

  // --- local storage adapter ---
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
  LOCAL_STORAGE_PUBLIC_URL: z.string().default('http://localhost:3001/files'),

  // --- ses adapter ---
  AWS_REGION: z.string().default('us-east-1'),
  SES_ACCESS_KEY: z.string().default(''),
  SES_SECRET_KEY: z.string().default(''),

  // --- rate limit / lockout ---
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().default(5),
  LOGIN_LOCK_DURATION: z.coerce.number().default(900),

  // --- observability ---
  SENTRY_DSN: z.string().default(''),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
});

export type Env = z.infer<typeof envSchema>;

/** Used by @nestjs/config `validate` — fails fast at boot if the env is wrong. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables. Don't Panic, just fix these:\n${issues}`);
  }
  return parsed.data;
}
