import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// --- module mocks -----------------------------------------------------------
const push = vi.fn();
const refresh = vi.fn();
const getParam = vi.fn<(key: string) => string | null>(() => null);

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
    oauth: {
      separator: 'or',
      continueWith: 'Continue with {provider}',
      provider: { google: 'Google', apple: 'Apple', github: 'GitHub' },
      errors: {
        failed: 'Social sign-in did not complete.',
        unverified_email: 'The provider has not confirmed that address.',
        no_account: 'There is no account for that email.',
        signup_disabled: 'Registering new companies is off.',
        account_conflict: 'That account cannot sign in this way.',
        provider_disabled: 'That provider is not available here.',
      },
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
    // Registration is on by default, so the link is offered.
    expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/signup');
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
    apiMock.mockRejectedValueOnce(
      new ApiError(401, { statusCode: 401, error: 'Unauthorized', message: 'nope' }),
    );
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
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
    apiMock.mockRejectedValueOnce(
      new ApiError(500, { statusCode: 500, error: 'Error', message: 'boom' }),
    );
    renderLogin();

    await user.type(screen.getByLabelText('Email'), 'ford@betelgeuse.net');
    await user.type(screen.getByLabelText('Password'), 'super-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith('Something went wrong.'));
  });

  it('shows the lockout message on a 423 response', async () => {
    const user = userEvent.setup();
    apiMock.mockRejectedValueOnce(
      new ApiError(423, { statusCode: 423, error: 'Locked', message: 'locked' }),
    );
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
      .mockRejectedValueOnce(
        new ApiError(401, { statusCode: 401, error: 'Unauthorized', message: 'bad code' }),
      );
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
      .mockRejectedValueOnce(
        new ApiError(500, { statusCode: 500, error: 'Error', message: 'boom' }),
      );
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

describe('LoginPage — registration gating', () => {
  it('hides the "create account" link when public signup is off', async () => {
    // Behind the link there would be nothing but a "closed" screen, and the
    // API answers 403 to every submit — so it is not offered at all.
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SIGNUP_ENABLED', 'false');
    const { default: GatedLogin } = await import('./page');

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en-US" messages={messages}>
          <GatedLogin />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByRole('link', { name: 'Create one' })).not.toBeInTheDocument();
    // The login form itself is untouched.
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('LoginPage — social sign-in', () => {
  it('renders one button per configured provider, through the BFF', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_OAUTH_PROVIDERS', 'google');
    const { default: SocialLogin } = await import('./page');

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en-US" messages={messages}>
          <SocialLogin />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/google/start?intent=login',
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('renders no social block when none is configured', () => {
    renderLogin();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
  });

  it('translates a callback error and takes it out of the address bar', async () => {
    getParam.mockImplementation((key: string) => (key === 'error' ? 'no_account' : null));
    const replaceState = vi.spyOn(window.history, 'replaceState');

    renderLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no account for that email.',
    );
    // Left in the URL it would come back on every reload, and travel on into
    // anything the user pastes.
    expect(replaceState).toHaveBeenCalled();
    expect(String(replaceState.mock.calls[0]?.[2])).not.toContain('error=');
    replaceState.mockRestore();
  });

  it('degrades an unknown error code to the coarse one instead of echoing it', async () => {
    // Whatever an attacker puts in the query string drives a translation, so it
    // must never reach the screen verbatim.
    getParam.mockImplementation((key: string) => (key === 'error' ? '<script>' : null));

    renderLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent('Social sign-in did not complete.');
  });
});

describe('LoginPage — second factor after social sign-in', () => {
  const TICKET_COOKIE = 'dp_2fa_ticket';

  afterEach(() => {
    document.cookie = `${TICKET_COOKIE}=; Path=/; Max-Age=0`;
  });

  // The bypass this closes: without the hand-off, a user who deliberately
  // enabled TOTP would get a full session straight out of the provider
  // redirect, and the factor they turned on would never be asked for.
  it('swaps to the code step using the ticket the callback left in a cookie', async () => {
    document.cookie = `${TICKET_COOKIE}=oauth-ticket-123; Path=/`;
    getParam.mockImplementation((key: string) => (key === 'twofactor' ? '1' : null));

    renderLogin();

    expect(await screen.findByLabelText('6-digit code')).toBeInTheDocument();
  });

  it('consumes the cookie and the query param so neither is replayed', async () => {
    document.cookie = `${TICKET_COOKIE}=oauth-ticket-123; Path=/`;
    getParam.mockImplementation((key: string) => (key === 'twofactor' ? '1' : null));
    const replaceState = vi.spyOn(window.history, 'replaceState');

    renderLogin();
    await screen.findByLabelText('6-digit code');

    // A ticket left in the jar would resurface on the next visit to this page,
    // long after the flow it belonged to was abandoned.
    expect(document.cookie).not.toContain(TICKET_COOKIE);
    expect(String(replaceState.mock.calls[0]?.[2])).not.toContain('twofactor=');
    replaceState.mockRestore();
  });

  it('verifies the code with the ticket from the cookie and navigates', async () => {
    document.cookie = `${TICKET_COOKIE}=oauth-ticket-123; Path=/`;
    getParam.mockImplementation((key: string) => (key === 'twofactor' ? '1' : null));
    apiMock.mockResolvedValueOnce({ user: { id: 'u1' } });

    renderLogin();
    await screen.findByLabelText('6-digit code');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('6-digit code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await vi.waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith('/auth/2fa/verify', {
        method: 'POST',
        body: { ticket: 'oauth-ticket-123', code: '123456' },
      }),
    );
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  // Expired, or dropped by the browser. There is nothing the user can do with
  // that distinction, so it collapses into the ordinary failure message rather
  // than a dead code form with no ticket behind it.
  it('falls back to the generic failure when the cookie is gone', async () => {
    getParam.mockImplementation((key: string) => (key === 'twofactor' ? '1' : null));

    renderLogin();

    expect(await screen.findByRole('alert')).toHaveTextContent('Social sign-in did not complete.');
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument();
  });
});
