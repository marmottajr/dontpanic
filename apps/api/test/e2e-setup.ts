/**
 * E2E env bootstrap — runs via jest `setupFiles` BEFORE any module (and thus
 * before AppModule / config/env.ts) is imported. It MUST run before the shared
 * `setup.ts` so the real Postgres DATABASE_URL wins over that file's placeholder
 * (which only sets defaults when unset).
 *
 * Points the whole e2e run at a SEPARATE database (`dontpanic_e2e`) so the dev
 * data in `dontpanic` is never touched. The database is created (if missing) and
 * migrated by `global-setup.ts` once per run; here we only fix the env vars.
 */
/**
 * The app connects as the RESTRICTED role, exactly like production. That is
 * what makes the isolation tests prove anything: as the database owner the
 * app would bypass RLS and `tenant-isolation.e2e-spec.ts` would pass while the
 * policies were broken.
 */
export const E2E_DATABASE_URL =
  'postgresql://dontpanic_app:dontpanic_app@localhost:4202/dontpanic_e2e?schema=public';

/** The owner connection: DDL in global-setup, and test bookkeeping that has to
 *  see across tenants (seeding fixtures, counting leftovers, truncating). */
export const E2E_ADMIN_DATABASE_URL =
  'postgresql://dontpanic:dontpanic@localhost:4202/dontpanic_e2e?schema=public';

process.env.NODE_ENV = 'test';
process.env.CACHE_DRIVER = 'memory';
process.env.MAIL_DRIVER = 'console';
process.env.STORAGE_DRIVER = 'local';
process.env.DATABASE_URL = E2E_DATABASE_URL;
process.env.DATABASE_ADMIN_URL = E2E_ADMIN_DATABASE_URL;
// Real, deterministic secrets (>= 16 chars) so JWT signing/verification works
// end-to-end across the register -> login -> refresh -> logout cycle.
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-0123456789-abcdef';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret-0123456789-abcdef';
process.env.CSRF_SECRET = 'e2e-csrf-secret-0123456789-abcdef';
// Short-ish access TTL still comfortably outlives a single test.
process.env.JWT_ACCESS_TTL = '900';
process.env.JWT_REFRESH_TTL = '604800';
// Explicit, so the concurrency tests below don't depend on the schema default.
process.env.REFRESH_REUSE_GRACE = '10';
// Keep cookies non-Secure so supertest (plain http) actually receives them.
process.env.COOKIE_SECURE = 'false';
// Throttler is global; give the e2e run lots of headroom so login-failure loops
// (lockout tests) don't trip the rate limiter instead of the lockout path.
process.env.RATE_LIMIT_MAX = '100000';
process.env.RATE_LIMIT_WINDOW = '60000';
// Same headroom for the tighter auth budget, or the lockout tests would hit 429
// on the 11th attempt instead of reaching the lockout assertions.
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_WINDOW = '60000';
