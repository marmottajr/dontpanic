import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { UnderConstruction } from './under-construction';

const messages = {
  tenant: {
    construction: {
      title: 'Module under construction',
      body: 'This part does not exist yet.',
      back: 'Back to the dashboard',
    },
  },
};

const wrap = (node: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );

afterEach(cleanup);

describe('UnderConstruction', () => {
  it('names the module and admits it is not built', () => {
    wrap(<UnderConstruction title="Invoices" description="Issue and track invoices." />);

    expect(screen.getByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
    expect(screen.getByText('Issue and track invoices.')).toBeInTheDocument();
    expect(screen.getByText('Module under construction')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('omits the description when there is none, and honours a custom back link', () => {
    wrap(<UnderConstruction title="Reports" backHref="/reports" />);

    expect(screen.queryByText('Issue and track invoices.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute(
      'href',
      '/reports',
    );
  });
});
