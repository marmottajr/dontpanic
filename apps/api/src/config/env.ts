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

  // The runtime connection. MUST point at the restricted role: a superuser (or
  // any role with BYPASSRLS) ignores Row Level Security and tenant isolation
  // becomes decorative. PrismaService refuses to boot in production otherwise.
  DATABASE_URL: z.string().min(1),
  // The database owner, used only by migrate/seed, which do DDL. Optional so a
  // runtime container never needs the privileged credentials.
  DATABASE_ADMIN_URL: z.string().default(''),
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
  // Tighter budget for the unauthenticated auth surface (login, register,
  // password reset, 2FA). Applied per route per client, on top of the lockout.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),
  AUTH_RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().default(5),
  LOGIN_LOCK_DURATION: z.coerce.number().default(900),

  // --- background jobs ---
  // `bullmq` runs work in a separate worker process (see src/worker.ts);
  // `memory` runs it inline in the caller, for tests and for `pnpm dev`
  // without a worker. Inline is not a queue: no durability, no retry.
  QUEUE_DRIVER: z.enum(['bullmq', 'memory']).default('bullmq'),
  QUEUE_NAME: z.string().default('dontpanic'),
  /** Namespaces the Redis keys so two apps can share one Redis. */
  QUEUE_PREFIX: z.string().default('{dontpanic}'),
  QUEUE_CONCURRENCY: z.coerce.number().min(1).default(5),
  QUEUE_ATTEMPTS: z.coerce.number().min(1).default(5),
  /** First retry delay; BullMQ backs off exponentially from here. */
  QUEUE_BACKOFF: z.coerce.number().default(2000),

  // --- captcha ---
  // Human verification on the unauthenticated forms. Off by default so a fresh
  // clone boots without third-party keys; turn it on before going public.
  CAPTCHA_DRIVER: z.enum(['none', 'turnstile', 'recaptcha-v2', 'recaptcha-v3']).default('none'),
  CAPTCHA_SECRET_KEY: z.string().default(''),
  // reCAPTCHA v3 only — Google's own default threshold.
  CAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  CAPTCHA_TIMEOUT: z.coerce.number().default(5000),
  // What to do when the provider itself is unreachable. False (default) rejects
  // the request: an outage at Google/Cloudflare must not silently disable the
  // only bot defence on the login form. Flip to true to favour availability.
  CAPTCHA_FAIL_OPEN: boolish(false),

  // Which upstream hops may dictate the client IP via X-Forwarded-For. This is
  // what the rate limiter buckets on, so trusting the wrong thing makes every
  // limit above bypassable. Deployment-specific — see parseTrustProxy.
  TRUST_PROXY: z.string().default('loopback'),

  // --- observability ---
  SENTRY_DSN: z.string().default(''),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Translate TRUST_PROXY into Fastify's `trustProxy` option.
 *
 * The value says WHO is allowed to set `X-Forwarded-For` — never set it to
 * `true` on a public deployment: that trusts every hop, so any caller can forge
 * the header and hand itself a fresh rate-limit bucket per request.
 *
 * - `false`            — no proxy; use the socket address (safest, default off-box)
 * - `loopback`         — only 127.0.0.1/::1 (default: API and BFF on the same host)
 * - `uniquelocal`      — private ranges (Docker/Kubernetes networks)
 * - `2`                — number of trusted hops, counted from the socket inwards
 * - `10.0.0.0/8,::1`   — explicit IP/CIDR allowlist (most precise)
 */
export type TrustProxySetting = boolean | string | ((address: string, hop: number) => boolean);

export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? 'loopback').trim();
  if (value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) {
    // Fastify 5.12 dropped the bare number from `trustProxy`'s type, so express
    // the hop count the way it still accepts: trust the N hops closest to the
    // socket. `hop` is 0-based from the socket outwards, which is why the
    // comparison is `<` and not `<=`.
    const hops = Number(value);
    return (_address: string, hop: number) => hop < hops;
  }
  return value;
}

/** Used by @nestjs/config `validate` — fails fast at boot if the env is wrong. */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables. Don't Panic, just fix these:\n${issues}`);
  }
  if (parsed.data.CAPTCHA_DRIVER !== 'none' && !parsed.data.CAPTCHA_SECRET_KEY) {
    throw new Error(
      "Invalid environment variables. Don't Panic, just fix these:\n" +
        `  - CAPTCHA_SECRET_KEY: required when CAPTCHA_DRIVER is "${parsed.data.CAPTCHA_DRIVER}"`,
    );
  }
  return parsed.data;
}
