import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// --- module mocks -----------------------------------------------------------
const push = vi.fn();
const refresh = vi.fn();
const getParam = vi.fn(() => null);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  useSearchParams: () => ({ get: getParam }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }));

// `@hookform/resolvers/zod` re-imports `zod` via an ESM subpath that Vite's
// jsdom resolver can't follow in this monorepo. We don't need real zod
// validation to drive the screen, so swap in a permissive resolver that just
// passes the typed values through.
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => async (values: Record<string, unknown>) => ({
    values,
    errors: {},
  }),
}));

// the real lib/api is exercised separately; here we control the network surface.
const apiMock = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import LoginPage from './page';
import { ApiError } from '@/lib/api';

// minimal messages covering every key the login screen reads.
const messages = {
  common: { email: 'Email', password: 'Password', submit: 'Submit' },
  auth: {
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in to continue.',
      submit: 'Sign in',
      forgot: 'Forgot password?',
      noAccount: 'No account?',
      signup: 'Create one',
      twoFactorTitle: 'Two-factor verification',
      twoFactorSubtitle: 'Enter your code.',
      code: '6-digit code',
      verify: 'Verify',
      invalid: 'Incorrect email or password.',
      locked: 'Account temporarily locked.',
    },
  },
  errors: { generic: 'Something went wrong.' },
};

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <LoginPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  toastError.mockReset();
  apiMock.mockReset();
  getParam.mockReturnValue(null);
});

describe('LoginPage', () => {
  it('renders the localized title, fields and submit button', () => {
    renderLogin();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('submits credentials and navigates on success', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({ user: { id: '1', email: 'ford@b.net' } });
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await vi.waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/auth/login', {
        method: 'POST',
        body: { email: 'ford@betelgeuse.net', password: 'super-secret' },
      }),
    );
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('shows an inline error on invalid (401) credentials', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError(401, { message: 'nope' }));
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect email or password.',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('swaps to the 2FA step when the API requires it', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce({ twoFactorRequired: true, ticket: 'tkt-1' });
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Two-factor verification')).toBeInTheDocument();
    expect(screen.getByLabelText('6-digit code')).toBeInTheDocument();
    // we have not navigated yet — still on the challenge
    expect(push).not.toHaveBeenCalled();
  });

  it('toasts a generic error on an unexpected failure', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError(500, { message: 'boom' }));
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith('Something went wrong.'));
  });

  it('shows the lockout message on a 423 response', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(new ApiError(423, { message: 'locked' }));
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Account temporarily locked.');
    expect(push).not.toHaveBeenCalled();
  });

  it('completes login through the 2FA step and navigates', async () => {
    const user = userEvent.setup();
    // 1st call: login -> 2FA challenge; 2nd call: 2fa/verify -> success
    apiMock
      .mockResolvedValueOnce({ twoFactorRequired: true, ticket: 'tkt-1' })
      .mockResolvedValueOnce({ user: { id: '1', email: 'ford@b.net' } });
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const codeInput = await screen.findByLabelText('6-digit code');
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await vi.waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith('/auth/2fa/verify', {
        method: 'POST',
        body: { ticket: 'tkt-1', code: '123456' },
      }),
    );
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('shows an inline error when the 2FA code is rejected (401)', async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce({ twoFactorRequired: true, ticket: 'tkt-1' })
      .mockRejectedValueOnce(new ApiError(401, { message: 'bad code' }));
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const codeInput = await screen.findByLabelText('6-digit code');
    await user.type(codeInput, '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(push).not.toHaveBeenCalled();
  });

  it('toasts a generic error when 2FA verify fails unexpectedly (500)', async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce({ twoFactorRequired: true, ticket: 'tkt-1' })
      .mockRejectedValueOnce(new ApiError(500, { message: 'boom' }));
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const codeInput = await screen.findByLabelText('6-digit code');
    await user.type(codeInput, '654321');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith('Something went wrong.'));
    expect(push).not.toHaveBeenCalled();
  });
});
