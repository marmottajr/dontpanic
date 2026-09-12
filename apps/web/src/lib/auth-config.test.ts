import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseOAuthProviders, oauthStartUrl } from './auth-config';

/**
 * Like the captcha module, this one reads NEXT_PUBLIC_* once at import time
 * (Next inlines them at build), so every case stubs the env and re-imports.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import('./auth-config');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('signupEnabled', () => {
  it('defaults to on when the variable is absent — a fresh clone must be able to sign up', async () => {
    const mod = await load({ NEXT_PUBLIC_SIGNUP_ENABLED: undefined });
    expect(mod.signupEnabled).toBe(true);
  });

  it('treats an empty string as absent', async () => {
    const mod = await load({ NEXT_PUBLIC_SIGNUP_ENABLED: '   ' });
    expect(mod.signupEnabled).toBe(true);
  });

  it('turns off only on an explicit falsy value', async () => {
    for (const raw of ['false', 'FALSE', '0', 'no', 'off']) {
      const mod = await load({ NEXT_PUBLIC_SIGNUP_ENABLED: raw });
      expect(mod.signupEnabled, raw).toBe(false);
    }
  });

  it('stays on for the explicit truthy spellings', async () => {
    for (const raw of ['true', '1', 'yes', 'ON']) {
      const mod = await load({ NEXT_PUBLIC_SIGNUP_ENABLED: raw });
      expect(mod.signupEnabled, raw).toBe(true);
    }
  });

  it('keeps the default on an unrecognised value instead of guessing', async () => {
    const mod = await load({ NEXT_PUBLIC_SIGNUP_ENABLED: 'maybe' });
    expect(mod.signupEnabled).toBe(true);
  });
});

describe('parseOAuthProviders', () => {
  it('is empty when nothing is configured', () => {
    expect(parseOAuthProviders(undefined)).toEqual([]);
    expect(parseOAuthProviders('')).toEqual([]);
    expect(parseOAuthProviders(' , , ')).toEqual([]);
  });

  it('trims, lowercases and accepts the known providers', () => {
    expect(parseOAuthProviders(' Google , APPLE ')).toEqual(['google', 'apple']);
  });

  it('orders by the shared constant, not by what was typed', () => {
    // Two deployments listing the same providers in different orders must
    // render the same buttons in the same places.
    expect(parseOAuthProviders('github,google,apple')).toEqual(['google', 'apple', 'github']);
    expect(parseOAuthProviders('apple,github,google')).toEqual(['google', 'apple', 'github']);
  });

  it('drops unknown names — a typo must not become a button that 404s', () => {
    expect(parseOAuthProviders('googel,google,facebook')).toEqual(['google']);
  });

  it('deduplicates a repeated provider', () => {
    expect(parseOAuthProviders('google,google')).toEqual(['google']);
  });
});

describe('enabledOAuthProviders / oauthEnabled', () => {
  it('reads the env list at module load', async () => {
    const mod = await load({ NEXT_PUBLIC_OAUTH_PROVIDERS: 'google,github' });
    expect(mod.enabledOAuthProviders).toEqual(['google', 'github']);
    expect(mod.oauthEnabled).toBe(true);
  });

  it('is off with no list at all', async () => {
    const mod = await load({ NEXT_PUBLIC_OAUTH_PROVIDERS: undefined });
    expect(mod.enabledOAuthProviders).toEqual([]);
    expect(mod.oauthEnabled).toBe(false);
  });
});

describe('oauthStartUrl', () => {
  it('points at the BFF, carrying the intent', () => {
    expect(oauthStartUrl('google', 'login')).toBe('/api/auth/oauth/google/start?intent=login');
    expect(oauthStartUrl('apple', 'signup')).toBe('/api/auth/oauth/apple/start?intent=signup');
  });

  it('never addresses the API origin directly', () => {
    expect(oauthStartUrl('github', 'login').startsWith('/api/')).toBe(true);
  });
});
