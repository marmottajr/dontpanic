'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.serverError');

  useEffect(() => {
    // Surface to the browser console for debugging; never shown to the user.
    console.error(error);
  }, [error]);

  return (
    <main className="bg-guide flex min-h-screen flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
        <span className="inline-flex" aria-label="DontPanic">
          <Brand size="md" />
        </span>

        <p className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-primary">
          Don&apos;t Panic.
        </p>

        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground">{t('body')}</p>
        </div>

        <p className="font-mono text-xs text-muted-foreground">{t('marvin')}</p>

        <Button size="lg" onClick={() => reset()}>
          {t('retry')}
        </Button>
      </div>
    </main>
  );
}
