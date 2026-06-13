import * as Sentry from '@sentry/nextjs';

// Server-side (Node runtime) Sentry. No-op unless SENTRY_DSN is set.
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn: dsn || undefined,
  enabled: !!dsn,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
});
