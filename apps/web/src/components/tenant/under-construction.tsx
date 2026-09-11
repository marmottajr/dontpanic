'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, HardHat } from 'lucide-react';

/**
 * An honest empty state for a module that is on the map but does not exist yet.
 *
 * Deliberately without numbers, charts or sample rows: a screen full of made-up
 * data teaches the user to distrust every other screen. It says what the module
 * will do and admits that it does not do it yet.
 */
export function UnderConstruction({
  title,
  description,
  backHref = '/',
}: {
  title: string;
  description?: string;
  backHref?: string;
}) {
  const t = useTranslations('tenant.construction');

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>

      <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-border bg-card/50 p-8">
        <span className="flex size-11 items-center justify-center rounded-full border border-accent/40 bg-accent/15 text-accent-strong">
          <HardHat className="size-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="font-display text-lg font-semibold tracking-tight">{t('title')}</p>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{t('body')}</p>
        </div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('back')}
        </Link>
      </div>
    </div>
  );
}
