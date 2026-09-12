import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => async (values: Record<string, unknown>) => ({ values, errors: {} }),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: vi.fn() };
});

const messages = {
  common: { name: 'Name', email: 'Email', password: 'Password' },
  auth: {
    signup: {
      title: 'Create your company',
      subtitle: 'Get started in seconds.',
      companyLegend: 'The company',
      adminLegend: 'Your administrator account',
      companyName: 'Company name',
      companyNamePlaceholder: 'Sirius Cybernetics',
      slug: 'Company address',
      slugHint: 'Lowercase only.',
      slugTaken: 'Taken.',
      emailTaken: 'Taken.',
      acceptTerms: 'I accept the terms.',
      acceptTermsRequired: 'You must accept the terms.',
      submit: 'Create company',
      hasAccount: 'Already have an account?',
      signin: 'Sign in',
      success: 'Created!',
      closedTitle: 'Registration closed',
      closedBody: 'This system does not accept public registration.',
      closedInvite: 'Access is by invitation.',
    },
    captcha: { required: 'Solve the challenge.', failed: 'x', unavailable: 'x' },
    oauth: {
      separator: 'or',
      continueWith: 'Continue with {provider}',
      provider: { google: 'Google', apple: 'Apple', github: 'GitHub' },
    },
  },
  validation: { required: 'Required field', email: 'Invalid email', passwordWeak: 'Min. 8 chars' },
  errors: { generic: 'Something went wrong.' },
};

async function renderSignup(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const { default: SignupPage } = await import('./page');

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <SignupPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('SignupPage — registration gating', () => {
  it('renders the form when registration is on (the default)', async () => {
    await renderSignup({ NEXT_PUBLIC_SIGNUP_ENABLED: undefined });

    expect(screen.getByText('Create your company')).toBeInTheDocument();
    expect(screen.getByLabelText('Company name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create company' })).toBeInTheDocument();
  });

  it('renders a sober closed state instead of the form when registration is off', async () => {
    await renderSignup({ NEXT_PUBLIC_SIGNUP_ENABLED: 'false' });

    expect(screen.getByText('Registration closed')).toBeInTheDocument();
    // Not one field: the API answers 403 to every submit, so a form here could
    // only waste the visitor's time.
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create company' })).not.toBeInTheDocument();
  });

  it('points the closed state at the login screen', async () => {
    await renderSignup({ NEXT_PUBLIC_SIGNUP_ENABLED: 'false' });

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('offers no social buttons on the closed state either', async () => {
    await renderSignup({
      NEXT_PUBLIC_SIGNUP_ENABLED: 'false',
      NEXT_PUBLIC_OAUTH_PROVIDERS: 'google',
    });

    // A social signup would hit the same 403 wall.
    expect(screen.queryByRole('link', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('offers the social buttons with intent=signup when registration is on', async () => {
    await renderSignup({ NEXT_PUBLIC_OAUTH_PROVIDERS: 'google' });

    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/google/start?intent=signup',
    );
  });
});
