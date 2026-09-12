import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

/**
 * The route gate has three categories, and conflating any two of them is a bug
 * someone will otherwise rediscover: pre-auth pages (only without a session),
 * open pages (always), and everything else (only with a session).
 */
function request(pathname: string, authed: boolean) {
  const url = new URL(`https://app.dontpanic.dev${pathname}`);
  return {
    nextUrl: Object.assign(url, { clone: () => new URL(url.toString()) }),
    cookies: { has: (name: string) => authed && name === 'access_token' },
  } as unknown as Parameters<typeof proxy>[0];
}

const locationOf = (res: ReturnType<typeof proxy>) => res.headers.get('location');

describe('proxy route gate', () => {
  it('sends an anonymous visitor to login, remembering where they were', () => {
    const res = proxy(request('/profile', false));
    const location = locationOf(res);
    expect(location).toContain('/login');
    expect(location).toContain('from=%2Fprofile');
  });

  it('lets an anonymous visitor reach the pre-auth pages', () => {
    for (const path of ['/login', '/signup', '/forgot-password', '/reset-password']) {
      expect(locationOf(proxy(request(path, false)))).toBeNull();
    }
  });

  it('lets an invited stranger reach the accept screen, token and all', () => {
    // The whole point of the link: no session yet, and the token is a path
    // segment rather than a query param.
    expect(locationOf(proxy(request('/invite/abc123token', false)))).toBeNull();
  });

  it('sends an already signed-in visitor away from an invite link', () => {
    // Accepting is a registration: doing it under someone else's live session
    // would build a second account behind the first one's cookies.
    expect(locationOf(proxy(request('/invite/abc123token', true)))).toContain('/');
  });

  it('keeps the social signup completion screen pre-auth', () => {
    // It runs on a one-shot ticket, before any account exists.
    expect(locationOf(proxy(request('/signup/complete', false)))).toBeNull();
  });

  it('sends a signed-in user away from the pre-auth pages', () => {
    expect(locationOf(proxy(request('/login', true)))).toContain('/');
  });

  it('lets a signed-in user through to an ordinary page', () => {
    expect(locationOf(proxy(request('/profile', true)))).toBeNull();
  });

  it('serves the legal pages to everyone, in both directions', () => {
    // Open, not pre-auth: a reader with a session must not be bounced to the
    // dashboard, and one without must not be bounced to login.
    for (const path of ['/termos', '/privacidade']) {
      expect(locationOf(proxy(request(path, false)))).toBeNull();
      expect(locationOf(proxy(request(path, true)))).toBeNull();
    }
  });

  it('matches on segment boundaries, not bare string prefixes', () => {
    // `/loginsomething` is not the login page, and must stay gated.
    expect(locationOf(proxy(request('/loginsomething', false)))).toContain('/login');
    // Nested paths under an open prefix stay open.
    expect(locationOf(proxy(request('/termos/anexo', false)))).toBeNull();
  });

  it('does not let the root path switch the whole gate off', () => {
    // Every pathname starts with '/', so treating it as a prefix would open
    // the entire app.
    expect(locationOf(proxy(request('/', false)))).toContain('/login');
  });
});
