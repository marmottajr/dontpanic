import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { OAuthButtons } from './oauth-buttons';

const messages = {
  auth: {
    oauth: {
      separator: 'or',
      continueWith: 'Continue with {provider}',
      provider: { google: 'Google', apple: 'Apple', github: 'GitHub' },
    },
  },
};

function wrap(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('OAuthButtons', () => {
  it('renders one button per provider, labelled and in the given order', () => {
    wrap(<OAuthButtons intent="login" providers={['google', 'github']} />);

    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual([
      'Continue with Google',
      'Continue with GitHub',
    ]);
  });

  it('navigates through the BFF, carrying the intent', () => {
    wrap(<OAuthButtons intent="signup" providers={['apple']} />);

    expect(screen.getByRole('link', { name: 'Continue with Apple' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/apple/start?intent=signup',
    );
  });

  it('uses a real anchor — the start endpoint is a 302 the browser has to follow', () => {
    wrap(<OAuthButtons intent="login" providers={['google']} />);
    expect(screen.getByRole('link', { name: 'Continue with Google' }).tagName).toBe('A');
  });

  it('renders nothing at all with no providers — no orphan "or" separator', () => {
    const { container } = wrap(<OAuthButtons intent="login" providers={[]} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
  });

  it('shows the separator once the block has something under it', () => {
    wrap(<OAuthButtons intent="login" providers={['google']} />);
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('falls back to the configured env list when no override is given', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_OAUTH_PROVIDERS', 'github,google');
    const { OAuthButtons: Fresh } = await import('./oauth-buttons');

    wrap(<Fresh intent="login" />);

    // Order comes from the shared constant, not from the env string.
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Continue with Google',
      'Continue with GitHub',
    ]);
  });

  it('renders nothing when the env configures no provider', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_OAUTH_PROVIDERS', '');
    const { OAuthButtons: Fresh } = await import('./oauth-buttons');

    const { container } = wrap(<Fresh intent="login" />);
    expect(container).toBeEmptyDOMElement();
  });
});
