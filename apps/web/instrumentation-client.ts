import * as Sentry from '@sentry/nextjs';

// Browser-side Sentry. No-op unless NEXT_PUBLIC_SENTRY_DSN is set.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: dsn || undefined,
  enabled: !!dsn,
  tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
});

// Instruments App Router client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
