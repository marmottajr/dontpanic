/**
 * Global test env defaults — loaded via jest `setupFiles` BEFORE the test
 * framework/modules import config. Keeps unit tests infra-free (hexagonal):
 * memory cache, console mail, local storage. Dummy secrets satisfy env.ts
 * (JWT_*_SECRET / CSRF_SECRET must be >= 16 chars).
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  CACHE_DRIVER: 'memory',
  MAIL_DRIVER: 'console',
  STORAGE_DRIVER: 'local',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
  CSRF_SECRET: 'test-csrf-secret-0123456789',
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) process.env[key] = value;
}
