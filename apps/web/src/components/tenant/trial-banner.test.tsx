import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const apiMock = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import { TrialBanner, TrialNotice } from './trial-banner';

const messages = {
  tenant: {
    trial: {
      daysLeft: 'Trial: {days} days left.',
      endsToday: 'Your trial ends today.',
      hint: 'After that, access is blocked until you pick a plan.',
      seePlan: 'See plan',
    },
  },
};

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en-US" messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const NOW = new Date('2026-01-01T00:00:00.000Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

beforeEach(() => {
  apiMock.mockReset();
});

// The Vitest setup does not register Testing Library's automatic cleanup, and
// several of these cases mount the component more than once.
afterEach(cleanup);

describe('TrialNotice', () => {
  it('counts the days left and links to the plan', () => {
    wrap(<TrialNotice status="TRIAL" trialEndsAt={inDays(7)} now={NOW} />);

    expect(screen.getByRole('status')).toHaveTextContent('Trial: 7 days left.');
    expect(screen.getByRole('link', { name: 'See plan' })).toHaveAttribute('href', '/profile');
  });

  it('says the trial ends today once the date has passed', () => {
    wrap(<TrialNotice status="TRIAL" trialEndsAt={inDays(-1)} now={NOW} />);

    expect(screen.getByRole('status')).toHaveTextContent('Your trial ends today.');
  });

  it('says the trial ends today when there is no end date at all', () => {
    wrap(<TrialNotice status="TRIAL" trialEndsAt={null} now={NOW} />);

    expect(screen.getByRole('status')).toHaveTextContent('Your trial ends today.');
  });

  it('turns urgent in the final days', () => {
    const urgent = wrap(<TrialNotice status="TRIAL" trialEndsAt={inDays(2)} now={NOW} />);
    expect(screen.getByRole('status').className).toContain('destructive');
    urgent.unmount();

    wrap(<TrialNotice status="TRIAL" trialEndsAt={inDays(20)} now={NOW} />);
    expect(screen.getByRole('status').className).not.toContain('destructive');
  });

  it('stays out of the way for every other status', () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'CANCELED'] as const) {
      const { unmount } = wrap(<TrialNotice status={status} trialEndsAt={inDays(7)} now={NOW} />);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('TrialBanner', () => {
  it('renders nothing until the tenant is known', () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    wrap(<TrialBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the strip for a company still on trial', async () => {
    apiMock.mockResolvedValue({
      id: 't1',
      name: 'Acme',
      status: 'TRIAL',
      trialEndsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    });
    wrap(<TrialBanner />);

    expect(await screen.findByRole('status')).toHaveTextContent('Trial: 5 days left.');
    expect(apiMock).toHaveBeenCalledWith('/tenants/me');
  });

  it('shows nothing for an active company', async () => {
    apiMock.mockResolvedValue({ id: 't1', name: 'Acme', status: 'ACTIVE', trialEndsAt: null });
    wrap(<TrialBanner />);

    await vi.waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
