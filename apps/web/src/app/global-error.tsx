'use client';

import { useEffect } from 'react';
import './globals.css';

/**
 * Last-resort fallback: renders when the root layout itself throws, so it lives
 * OUTSIDE the providers (no i18n / theme context). Keep it self-contained and
 * copy-light. Never surfaces the raw error to the user.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <main className="bg-guide flex min-h-screen flex-col items-center justify-center px-4 py-12 text-center">
          <div className="w-full max-w-md space-y-5">
            <p className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Don&apos;t Panic.
            </p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              Something broke
            </h1>
            <p className="text-muted-foreground">
              We hit an unexpected error. The towel is on its way.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-px"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
