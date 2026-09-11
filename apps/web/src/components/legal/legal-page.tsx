'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { Brand } from '@/components/brand';
import { LegalDocumentView, type LegalDocument } from './legal-document';
import { OPERATOR_INCOMPLETE } from './company';

/**
 * The frame around the legal pages.
 *
 * Deliberately outside the dashboard layout: whoever reads these documents may
 * have no account at all — that is the case for someone deciding whether to
 * create one.
 */
export function LegalPage({
  document,
  otherHref,
  otherLabel,
}: {
  document: LegalDocument;
  otherHref: string;
  otherLabel: string;
}) {
  const t = useTranslations('legal.page');

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-[68ch] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label={t('home')}>
            <Brand size="sm" />
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('back')}
          </Link>
        </div>
      </header>

      {/* A legal document without the identification of who is bound by it binds
          nobody: LGPD art. 9, III and IV requires the controller to be
          identified, and the Consumer Code requires the supplier to be
          identifiable. While the fields are still blank, the page says so in
          plain sight — the only place where that warning is worth anything. */}
      {OPERATOR_INCOMPLETE ? (
        <div className="border-b border-destructive/30 bg-destructive/10">
          <p
            role="alert"
            className="mx-auto flex w-full max-w-[68ch] items-start gap-2 px-4 py-3 text-sm text-destructive sm:px-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold">{t('incompleteTitle')}</strong>{' '}
              {t('incompleteBody')}
            </span>
          </p>
        </div>
      ) : null}

      <main>
        <LegalDocumentView document={document} />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[68ch] flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm sm:px-6">
          <Link
            href={otherHref}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {otherLabel}
          </Link>
          <p className="text-muted-foreground">{t('governingLaw')}</p>
        </div>
      </footer>
    </div>
  );
}
