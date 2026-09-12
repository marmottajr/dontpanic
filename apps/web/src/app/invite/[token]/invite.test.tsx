import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const push = vi.fn();
const refresh = vi.fn();
let token: string | string[] = 'a-valid-looking-token';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  useParams: () => ({ token }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

// Same reason as the login screen: `@hookform/resolvers/zod` re-imports zod
// through an ESM subpath Vite's jsdom resolver cannot follow in this monorepo.
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => async (values: Record<string, unknown>) => ({ values, errors: {} }),
}));

const apiMock = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: (...args: unknown[]) => apiMock(...args) };
});

import AcceptInvitationPage from './page';
import { ApiError } from '@/lib/api';

const messages = {
  common: {
    email: 'Email',
    name: 'Name',
    password: 'Password',
    cancel: 'Cancel',
    loading: 'Loading…',
  },
  auth: {
    login: { submit: 'Sign in' },
    signup: {
      acceptTerms: 'I accept the terms.',
      acceptTermsRequired: 'You must accept the terms.',
    },
    reset: { confirmPassword: 'Confirm password', mismatch: "Passwords don't match." },
  },
  validation: { required: 'Required field', passwordWeak: 'Min. 8 chars' },
  errors: { generic: 'Something went wrong.' },
  invite: {
    title: 'You have been invited to {company}',
    subtitle: 'Choose your password.',
    company: 'Company',
    submit: 'Accept invitation',
    invalidTitle: 'Invitation unavailable',
    invalid: 'This invitation is no longer valid.',
    invalidHint: 'Ask the administrator for a new one.',
    termsLink: 'Terms of Use',
    privacyLink: 'Privacy Policy',
  },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <AcceptInvitationPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const PREVIEW = {
  email: 'trillian@heartofgold.net',
  name: 'Trillian',
  tenantName: 'Sirius Cybernetics',
  expiresAt: '2026-10-01T12:00:00.000Z',
};

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  apiMock.mockReset();
  token = 'a-valid-looking-token';
});

describe('AcceptInvitationPage — a live invitation', () => {
  it('reads the preview through the BFF and shows what is being joined', async () => {
    apiMock.mockResolvedValueOnce(PREVIEW);
    renderPage();

    expect(
      await screen.findByText('You have been invited to Sirius Cybernetics'),
    ).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith('/auth/invitations/a-valid-looking-token');
    // The address is shown, never offered as a field.
    expect(screen.getByText('trillian@heartofgold.net')).toBeInTheDocument();
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
  });

  it('pre-fills the invited name but leaves it editable', async () => {
    apiMock.mockResolvedValueOnce(PREVIEW);
    renderPage();

    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue('Trillian');
    expect(name).not.toHaveAttribute('readonly');
  });

  it('accepts, and lands on the dashboard already signed in', async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce(PREVIEW).mockResolvedValueOnce({ user: { id: 'u1' } });
    renderPage();

    await user.type(await screen.findByLabelText('Password'), 'Secret42x');
    await user.type(screen.getByLabelText('Confirm password'), 'Secret42x');
    await user.click(screen.getByLabelText('I accept the terms.'));
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await vi.waitFor(() =>
      expect(apiMock).toHaveBeenLastCalledWith('/auth/invitations/accept', {
        method: 'POST',
        body: {
          token: 'a-valid-looking-token',
          name: 'Trillian',
          password: 'Secret42x',
          acceptTerms: true,
        },
      }),
    );
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('links the terms and the privacy policy', async () => {
    apiMock.mockResolvedValueOnce(PREVIEW);
    renderPage();

    expect(await screen.findByRole('link', { name: 'Terms of Use' })).toHaveAttribute(
      'href',
      '/termos',
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
  });

  it('says the same coarse thing when the token dies between preview and accept', async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(PREVIEW)
      .mockRejectedValueOnce(
        new ApiError(410, { statusCode: 410, error: 'Gone', message: 'expired' }),
      );
    renderPage();

    await user.type(await screen.findByLabelText('Password'), 'Secret42x');
    await user.type(screen.getByLabelText('Confirm password'), 'Secret42x');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('This invitation is no longer valid.'),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('falls back to the generic message on a server failure', async () => {
    const user = userEvent.setup();
    apiMock
      .mockResolvedValueOnce(PREVIEW)
      .mockRejectedValueOnce(new ApiError(500, { statusCode: 500, error: 'Error', message: 'x' }));
    renderPage();

    await user.type(await screen.findByLabelText('Password'), 'Secret42x');
    await user.type(screen.getByLabelText('Confirm password'), 'Secret42x');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith('Something went wrong.'));
  });

  it('keeps the name field empty when the invite carried no courtesy name', async () => {
    apiMock.mockResolvedValueOnce({ ...PREVIEW, name: null });
    renderPage();

    expect(await screen.findByLabelText('Name')).toHaveValue('');
  });

  it('reads the first segment when the route param arrives as an array', async () => {
    token = ['tok-one', 'tok-two'];
    apiMock.mockResolvedValueOnce(PREVIEW);
    renderPage();

    await screen.findByLabelText('Name');
    expect(apiMock).toHaveBeenCalledWith('/auth/invitations/tok-one');
  });
});

describe('AcceptInvitationPage — a dead invitation', () => {
  it('says one thing for invalid, expired and revoked alike', async () => {
    // The API refuses to distinguish them; the screen must not invent the
    // difference either — it would be a free oracle for probing tokens.
    for (const status of [404, 410, 403]) {
      apiMock.mockReset();
      apiMock.mockRejectedValueOnce(
        new ApiError(status, { statusCode: status, error: 'x', message: 'x' }),
      );
      const view = renderPage();

      expect(await screen.findByText('This invitation is no longer valid.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
      expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('does not even ask the API for an empty token', async () => {
    token = '';
    renderPage();

    expect(await screen.findByText('This invitation is no longer valid.')).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
