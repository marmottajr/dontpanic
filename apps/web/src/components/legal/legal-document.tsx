'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';

/**
 * A legal document rendered from data, not from loose HTML.
 *
 * The structure exists for a legal reason, not an aesthetic one: Brazil's
 * Consumer Code (art. 54, §4) requires clauses that limit a consumer's rights to
 * be "drafted with prominence, allowing immediate and easy comprehension", and
 * §3 requires legible characters no smaller than twelve point. A limitation of
 * liability buried mid-paragraph in grey text is exactly what those paragraphs
 * exist to prevent — and one a court finds insufficiently prominent protects
 * nobody.
 *
 * So `highlight: true` is not decoration: it is how the requirement is met, and
 * body text never drops below 1rem (16px).
 */

export interface LegalClause {
  /** The visible numbering — it is how the parties refer to the clause. */
  number: string;
  text: string;
  /** Sub-items, when the clause enumerates. */
  items?: string[];
}

export interface LegalSection {
  id: string;
  title: string;
  /** Introductory text for the section, before the numbered clauses. */
  intro?: string;
  clauses: LegalClause[];
  /**
   * A section that limits a right, restricts liability or puts a burden on the
   * customer. Rendered with prominence, as art. 54, §4 of the Consumer Code
   * requires.
   */
  highlight?: boolean;
}

export interface LegalDocument {
  title: string;
  /** The document's version. It is what gets recorded as proof of acceptance. */
  version: string;
  /** The date this version came into force (`YYYY-MM-DD`). */
  effectiveDate: string;
  summary: string[];
  sections: LegalSection[];
}

function SectionBody({ section }: { section: LegalSection }) {
  return (
    <>
      {section.intro ? <p className="mb-4 text-base leading-relaxed">{section.intro}</p> : null}
      {/* `data-legal-body` marks the text the Consumer Code sizes: the clauses
          themselves, not the navigation around them. */}
      <ol data-legal-body className="space-y-3">
        {section.clauses.map((clause) => (
          <li key={clause.number} className="text-base leading-relaxed">
            <span className="font-mono text-sm font-semibold tabular-nums">{clause.number}</span>{' '}
            {clause.text}
            {clause.items ? (
              <ul data-legal-body className="mt-2 space-y-1.5 pl-5">
                {clause.items.map((item) => (
                  <li key={item} className="list-disc text-base leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}

export function LegalDocumentView({ document }: { document: LegalDocument }) {
  const t = useTranslations('legal.document');
  const locale = useLocale();
  const effective = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
    new Date(`${document.effectiveDate}T00:00:00`),
  );

  return (
    <article className="mx-auto w-full max-w-[68ch] px-4 py-10 sm:px-6 sm:py-16">
      <header className="border-b border-border pb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {document.title}
        </h1>
        <p className="mt-3 font-mono text-sm text-muted-foreground">
          {t('versionLine', { version: document.version, date: effective })}
        </p>
      </header>

      {/* The summary does not replace the document, and says so about itself: a
          summary that presents itself as the contract is misleading advertising
          in disguise. */}
      <section className="mt-8 rounded-xl border border-border bg-muted/40 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('summaryTitle')}
        </h2>
        <ul className="mt-3 space-y-2">
          {document.summary.map((line) => (
            <li key={line} className="flex gap-2 text-base leading-relaxed">
              <span aria-hidden="true" className="text-accent-strong">
                ·
              </span>
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">{t('summaryDisclaimer')}</p>
      </section>

      <nav aria-label={t('tocTitle')} className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('tocTitle')}
        </h2>
        <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {document.sections.map((section, index) => (
            <li key={section.id} className="text-sm">
              <a
                href={`#${section.id}`}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <span className="font-mono tabular-nums">{index + 1}.</span> {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {document.sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            // `scroll-mt`: the sticky header used to cover the section title
            // whenever someone arrived from a link in the table of contents —
            // leaving the clause that matters half out of view.
            className={
              section.highlight
                ? 'scroll-mt-24 rounded-xl border-2 border-accent-strong/40 bg-accent/10 p-5 sm:p-6'
                : 'scroll-mt-24'
            }
          >
            <h2 className="flex items-start gap-2 text-xl font-semibold tracking-tight">
              {section.highlight ? (
                <AlertTriangle
                  className="mt-1 size-5 shrink-0 text-accent-strong"
                  aria-hidden="true"
                />
              ) : null}
              <span>
                <span className="font-mono tabular-nums">{index + 1}.</span> {section.title}
              </span>
            </h2>
            {section.highlight ? (
              <p className="mt-2 text-sm font-medium text-accent-strong">{t('highlightNotice')}</p>
            ) : null}
            <div className="mt-4">
              <SectionBody section={section} />
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
