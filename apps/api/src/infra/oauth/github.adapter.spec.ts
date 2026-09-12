import { GitHubOAuthAdapter, pickVerifiedPrimaryEmail } from './github.adapter';
import { oauthCallbackUri, oauthCookiePath } from './callback-url';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ok = (payload: unknown) => ({ ok: true, json: async () => payload });

const OPTIONS = {
  clientId: 'Iv1.abc123',
  clientSecret: 'shhh',
  redirectUri: 'http://localhost:4200/api/auth/oauth/github/callback',
};

describe('pickVerifiedPrimaryEmail', () => {
  it('takes the address that is both primary and verified', () => {
    expect(
      pickVerifiedPrimaryEmail([
        { email: 'alt@dent.dev', primary: false, verified: true },
        { email: 'arthur@dent.dev', primary: true, verified: true },
      ]),
    ).toBe('arthur@dent.dev');
  });

  it('refuses a primary address GitHub has not verified', () => {
    expect(
      pickVerifiedPrimaryEmail([{ email: 'claimed@dent.dev', primary: true, verified: false }]),
    ).toBeNull();
  });

  it('does not fall back to a verified secondary', () => {
    expect(
      pickVerifiedPrimaryEmail([{ email: 'alt@dent.dev', primary: false, verified: true }]),
    ).toBeNull();
  });

  it('copes with a response that is not a list at all', () => {
    expect(pickVerifiedPrimaryEmail({ message: 'Not Found' })).toBeNull();
    expect(pickVerifiedPrimaryEmail([{ primary: true, verified: true }])).toBeNull();
  });
});

describe('callback urls', () => {
  it('builds the redirect uri on the WEB origin, one path per provider', () => {
    expect(oauthCallbackUri('http://localhost:4200/api/auth/oauth', 'google')).toBe(
      'http://localhost:4200/api/auth/oauth/google/callback',
    );
  });

  it('tolerates a trailing slash in the configured base', () => {
    expect(oauthCallbackUri('http://localhost:4200/api/auth/oauth/', 'apple')).toBe(
      'http://localhost:4200/api/auth/oauth/apple/callback',
    );
  });

  it('derives the cookie path from the same value, so the two cannot drift', () => {
    expect(oauthCookiePath('http://localhost:4200/api/auth/oauth')).toBe('/api/auth/oauth');
    expect(oauthCookiePath('https://app.example.com/api/auth/oauth/')).toBe('/api/auth/oauth');
  });

  it('falls back to the conventional mount when the base is not a url', () => {
    expect(oauthCookiePath('')).toBe('/api/auth/oauth');
  });

  it('never yields an empty path', () => {
    expect(oauthCookiePath('http://localhost:4200/')).toBe('/');
  });
});

describe('GitHubOAuthAdapter', () => {
  const adapter = new GitHubOAuthAdapter(OPTIONS);

  it('is plain OAuth2: no form post, no PKCE', () => {
    expect(adapter.name).toBe('github');
    expect(adapter.usesFormPost).toBe(false);
    expect(adapter.usesPkce).toBe(false);
  });

  it('asks for the scope that makes /user/emails readable', () => {
    const url = new URL(adapter.authorizationUrl({ state: 'st', nonce: 'ignored' }));
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('exchanges, then reads the profile and the verified primary address', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 'gho_token' }))
      .mockResolvedValueOnce(ok({ id: 583231, name: 'Arthur Dent', login: 'arthur' }))
      .mockResolvedValueOnce(ok([{ email: 'arthur@dent.dev', primary: true, verified: true }]));

    await expect(adapter.exchange({ code: 'c0de', nonce: 'n' })).resolves.toEqual({
      providerAccountId: '583231',
      email: 'arthur@dent.dev',
      emailVerified: true,
      name: 'Arthur Dent',
    });

    // api.github.com answers 403 without a User-Agent, and the body explaining
    // that is exactly what a generic wrapper throws away.
    const [, userInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const headers = userInit.headers as Record<string, string>;
    expect(headers['user-agent']).toBe('DontPanic');
    expect(headers.authorization).toBe('Bearer gho_token');
  });

  it('falls back to the login handle when the profile has no name', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 't' }))
      .mockResolvedValueOnce(ok({ id: 1, name: null, login: 'zaphod' }))
      .mockResolvedValueOnce(ok([{ email: 'z@heart.dev', primary: true, verified: true }]));

    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).resolves.toMatchObject({
      name: 'zaphod',
    });
  });

  it('is nameless rather than broken when the profile has neither', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 't' }))
      .mockResolvedValueOnce(ok({ id: 1 }))
      .mockResolvedValueOnce(ok([{ email: 'z@heart.dev', primary: true, verified: true }]));

    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).resolves.toMatchObject({
      name: null,
    });
  });

  it('reports no verified address rather than trusting an unverified one', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 't' }))
      .mockResolvedValueOnce(ok({ id: 7, login: 'marvin' }))
      .mockResolvedValueOnce(ok([{ email: 'marvin@sirius.dev', primary: true, verified: false }]));

    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).resolves.toMatchObject({
      email: null,
      emailVerified: false,
    });
  });

  it('catches the exchange GitHub refuses with HTTP 200 and an error field', async () => {
    fetchMock.mockResolvedValueOnce(ok({ error: 'bad_verification_code' }));
    await expect(adapter.exchange({ code: 'stale', nonce: 'n' })).rejects.toThrow(
      'bad_verification_code',
    );
  });

  it('refuses a 200 that simply has no access token', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).rejects.toThrow('no access_token');
  });

  it('refuses a profile with no id — there would be nothing to key the account on', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: 't' }))
      .mockResolvedValueOnce(ok({ login: 'ghost' }))
      .mockResolvedValueOnce(ok([]));
    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).rejects.toThrow('without an id');
  });
});
