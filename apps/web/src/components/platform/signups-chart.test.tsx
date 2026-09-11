import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SignupsChart } from './signups-chart';

const messages = {
  platform: {
    overview: {
      chartTitle: 'Signups per day',
      chartEmpty: 'No signups in this window.',
      chartPoint: '{day}: {count} signups',
    },
  },
};

const wrap = (data: { date: string; count: number }[]) =>
  render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      <SignupsChart data={data} />
    </NextIntlClientProvider>,
  );

afterEach(cleanup);

describe('SignupsChart', () => {
  it('hands the shared BarChart one point per day, with a localized label', () => {
    const { container } = wrap([
      { date: '2026-03-01', count: 3 },
      { date: '2026-03-02', count: 0 },
      { date: '2026-03-03', count: 7 },
    ]);

    expect(screen.getByRole('img', { name: 'Signups per day' })).toBeInTheDocument();
    expect(container.querySelectorAll('rect')).toHaveLength(3);
    expect(screen.getByText(/Mar 01: 3 signups/)).toBeInTheDocument();
    expect(screen.getByText(/Mar 03: 7 signups/)).toBeInTheDocument();
  });

  it('says the window is empty rather than drawing an empty figure', () => {
    wrap([]);
    expect(screen.getByText('No signups in this window.')).toBeInTheDocument();
  });
});
