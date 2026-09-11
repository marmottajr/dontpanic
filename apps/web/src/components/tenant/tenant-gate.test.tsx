import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const replace = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn() }),
}));

const apiMock = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import { TenantBlocked, TenantGate } from './tenant-gate';
import { ApiError } from '@/lib/api';

const messages = {
  tenant: {
    blocked: {
      title: 'Access blocked',
      body: 'Your company’s access is suspended.',
      contact: 'Contact support with your company’s name.',
    },
  },
  nav: { logout: 'Log out' },
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

beforeEach(() => {
  apiMock.mockReset();
  replace.mockReset();
});
afterEach(cleanup);

describe('TenantBlocked', () => {
  it('shows the API’s own sentence as the detail', () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    wrap(<TenantBlocked detail="Your trial ended on 1 March." />);

    expect(screen.getByText('Access blocked')).toBeInTheDocument();
    expect(screen.getByText('Your trial ended on 1 March.')).toBeInTheDocument();
  });

  it('still explains itself when the API sent no detail', () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    wrap(<TenantBlocked />);

    expect(screen.getByText('Access blocked')).toBeInTheDocument();
    expect(screen.getByText('Contact support with your company’s name.')).toBeInTheDocument();
  });

  it('logs out from the blocked screen — the only action left', async () => {
    apiMock.mockResolvedValue({});
    wrap(<TenantBlocked detail="Suspended." />);

    await userEvent.click(screen.getByRole('button', { name: /log out/i }));
    expect(apiMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST' });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });
});

describe('TenantGate', () => {
  it('lets the shell through while the user loads', () => {
    apiMock.mockReturnValue(new Promise(() => {}));
    wrap(
      <TenantGate>
        <p>dashboard</p>
      </TenantGate>,
    );
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('lets the shell through for a healthy company', async () => {
    apiMock.mockResolvedValue({ id: 'u1', role: 'ADMIN' });
    wrap(
      <TenantGate>
        <p>dashboard</p>
      </TenantGate>,
    );
    await vi.waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('replaces the shell with the blocked card on a 403', async () => {
    apiMock.mockRejectedValue(
      new ApiError(403, { statusCode: 403, error: 'Forbidden', message: 'Company suspended.' }),
    );
    wrap(
      <TenantGate>
        <p>dashboard</p>
      </TenantGate>,
    );

    expect(await screen.findByText('Company suspended.')).toBeInTheDocument();
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  });

  it('takes the first sentence when the API sends an array of messages', async () => {
    apiMock.mockRejectedValue(
      new ApiError(403, {
        statusCode: 403,
        error: 'Forbidden',
        message: ['Trial expired.', 'Pick a plan.'],
      }),
    );
    wrap(
      <TenantGate>
        <p>dashboard</p>
      </TenantGate>,
    );

    expect(await screen.findByText('Trial expired.')).toBeInTheDocument();
  });

  it('does not block on a 401 — that is the session, not the company', async () => {
    apiMock.mockRejectedValue(new ApiError(401, null));
    wrap(
      <TenantGate>
        <p>dashboard</p>
      </TenantGate>,
    );

    await vi.waitFor(() => expect(apiMock).toHaveBeenCalled());
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});
