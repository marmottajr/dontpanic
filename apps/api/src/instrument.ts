import * as Sentry from '@sentry/node';

// Initialised before the rest of the app (imported first in main.ts) so Sentry's
// auto-instrumentation can hook the runtime. Reads raw process.env on purpose —
// it runs before @nestjs/config validation. A no-op when SENTRY_DSN is unset.
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn: dsn || undefined,
  enabled: !!dsn,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
});
