import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LEGAL_VERSIONS } from '@dontpanic/shared';
import type { ReactNode } from 'react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { LegalDocumentView, type LegalDocument } from './legal-document';
import { LegalPage } from './legal-page';
import { OPERATOR, OPERATOR_INCOMPLETE } from './company';
import { TERMS } from './terms-content';
import { PRIVACY } from './privacy-content';

const messages = {
  legal: {
    document: {
      versionLine: 'Version {version} · in force since {date}',
      summaryTitle: 'In short',
      summaryDisclaimer: 'This summary does not replace the text below.',
      tocTitle: 'Contents',
      highlightNotice: 'A clause limiting rights or liability.',
    },
    page: {
      home: 'Home',
      back: 'Back to the site',
      incompleteTitle: 'Unfinished document.',
      incompleteBody: 'The identifying details have not been filled in yet.',
      governingLaw: 'Governed by Brazilian law.',
      termsLink: 'Terms of Use',
      privacyLink: 'Privacy Policy',
    },
  },
};

const wrap = (node: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );

const SAMPLE: LegalDocument = {
  title: 'Terms',
  version: '1.0',
  effectiveDate: '2026-01-01',
  summary: ['You own your data.'],
  sections: [
    {
      id: 'plain',
      title: 'A plain section',
      intro: 'Some introduction.',
      clauses: [{ number: '1.1', text: 'A plain clause.' }],
    },
    {
      id: 'limits',
      title: 'A limiting section',
      highlight: true,
      clauses: [
        { number: '2.1', text: 'A limiting clause.', items: ['first item', 'second item'] },
      ],
    },
  ],
};

afterEach(cleanup);

describe('LegalDocumentView', () => {
  it('states the version and effective date — the pair the acceptance record points at', () => {
    wrap(<LegalDocumentView document={SAMPLE} />);

    expect(screen.getByText(/Version 1\.0 · in force since/)).toBeInTheDocument();
  });

  it('renders the summary as a summary, saying it is not the contract', () => {
    wrap(<LegalDocumentView document={SAMPLE} />);

    expect(screen.getByText('You own your data.')).toBeInTheDocument();
    expect(screen.getByText('This summary does not replace the text below.')).toBeInTheDocument();
  });

  it('links every section from the table of contents by its own id', () => {
    wrap(<LegalDocumentView document={SAMPLE} />);
    const toc = screen.getByRole('navigation', { name: 'Contents' });

    expect(within(toc).getByRole('link', { name: /A plain section/ })).toHaveAttribute(
      'href',
      '#plain',
    );
    expect(within(toc).getByRole('link', { name: /A limiting section/ })).toHaveAttribute(
      'href',
      '#limits',
    );
  });

  it('sets rights-limiting sections apart, as art. 54, §4 requires', () => {
    const { container } = wrap(<LegalDocumentView document={SAMPLE} />);

    expect(screen.getByText('A clause limiting rights or liability.')).toBeInTheDocument();
    const highlighted = container.querySelector('#limits');
    expect(highlighted?.className).toContain('border-accent-strong/40');
    expect(container.querySelector('#plain')?.className).not.toContain('border-accent-strong/40');
  });

  it('renders intro text and sub-items only where they exist', () => {
    wrap(<LegalDocumentView document={SAMPLE} />);

    expect(screen.getByText('Some introduction.')).toBeInTheDocument();
    expect(screen.getByText('first item')).toBeInTheDocument();
    expect(screen.getByText('second item')).toBeInTheDocument();
  });

  it('never drops body text below 16px — the Consumer Code sets a floor', () => {
    const { container } = wrap(<LegalDocumentView document={SAMPLE} />);

    // `text-base` is 1rem/16px. Every clause and every sub-item carries it;
    // a smaller utility class anywhere in the body would be a legal defect,
    // not a style choice.
    for (const item of container.querySelectorAll('[data-legal-body] > li')) {
      expect(item.className).toContain('text-base');
    }
  });
});

describe('LegalPage', () => {
  it('warns loudly, and in plain sight, while the operator’s data is blank', () => {
    wrap(<LegalPage document={SAMPLE} otherHref="/privacidade" otherLabel="Privacy Policy" />);

    // The fixture ships with placeholders on purpose, so the banner must show.
    expect(OPERATOR_INCOMPLETE).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('Unfinished document.');
  });

  it('frames the document outside the app shell and links to its sibling', () => {
    wrap(<LegalPage document={SAMPLE} otherHref="/privacidade" otherLabel="Privacy Policy" />);

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
    expect(screen.getByRole('link', { name: 'Back to the site' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Governed by Brazilian law.')).toBeInTheDocument();
  });
});

describe('the shipped templates', () => {
  const documents = { TERMS, PRIVACY };

  it('take their version from the shared source, never a local literal', () => {
    expect(TERMS.version).toBe(LEGAL_VERSIONS.terms);
    expect(PRIVACY.version).toBe(LEGAL_VERSIONS.privacy);
  });

  it.each(Object.entries(documents))('%s has unique section ids and clause numbers', (_, doc) => {
    const ids = doc.sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);

    const numbers = doc.sections.flatMap((section) =>
      section.clauses.map((clause) => clause.number),
    );
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it.each(Object.entries(documents))('%s marks at least one limiting section', (_, doc) => {
    expect(doc.sections.some((section) => section.highlight)).toBe(true);
  });

  it.each(Object.entries(documents))('%s is still a template, not a published text', (_, doc) => {
    const text = JSON.stringify(doc);
    // The templates are meant to be filled in. This assertion is the reminder:
    // when the real text is written, the ⚠ markers go and this expectation
    // flips to `not.toContain` — deliberately, by the person who wrote it.
    expect(text).toContain('⚠');
  });

  it.each(Object.entries(documents))('%s renders end to end', (_, doc) => {
    const { unmount } = wrap(<LegalDocumentView document={doc} />);
    expect(screen.getByRole('heading', { level: 1, name: doc.title })).toBeInTheDocument();
    unmount();
  });
});

describe('OPERATOR', () => {
  it('flags itself as incomplete while any field is a placeholder', () => {
    expect(OPERATOR_INCOMPLETE).toBe(true);
    expect(Object.values(OPERATOR).filter((value) => value.startsWith('⚠')).length).toBeGreaterThan(
      0,
    );
  });
});
