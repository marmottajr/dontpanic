import { OAuthExchangeError } from '../../core/oauth/oauth.provider';
import { GoogleOAuthAdapter } from './google.adapter';
import { claimIsTrue, claimString, decodeIdToken } from './id-token';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ok = (payload: unknown) => ({ ok: true, json: async () => payload });

/** A JWT with a real payload and a signature nobody looks at. */
function idToken(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`;
}

const OPTIONS = {
  clientId: 'client-42.apps.googleusercontent.com',
  clientSecret: 'shhh',
  redirectUri: 'http://localhost:4200/api/auth/oauth/google/callback',
};

const CLAIMS = {
  iss: 'https://accounts.google.com',
  aud: OPTIONS.clientId,
  sub: '1092837465',
  nonce: 'nonce-1',
  email: 'ford@betelgeuse.dev',
  email_verified: true,
  name: 'Ford Prefect',
};

describe('decodeIdToken', () => {
  const expect_ = { issuers: ['https://accounts.google.com'], audience: 'aud-1', nonce: 'n' };

  it('accepts a token that matches issuer, audience and nonce', () => {
    const claims = decodeIdToken(
      idToken({ ...expect_, iss: expect_.issuers[0], aud: 'aud-1', nonce: 'n', sub: 'x' }),
      expect_,
    );
    expect(claims.sub).toBe('x');
  });

  it('accepts an audience array containing our client id', () => {
    const token = idToken({
      iss: expect_.issuers[0],
      aud: ['other', 'aud-1'],
      nonce: 'n',
      sub: 'x',
    });
    expect(decodeIdToken(token, expect_).sub).toBe('x');
  });

  it('rejects something that is not a three-part JWT', () => {
    expect(() => decodeIdToken('not.a-jwt', expect_)).toThrow(OAuthExchangeError);
  });

  it('rejects a payload that is not JSON', () => {
    expect(() => decodeIdToken('a.bm90LWpzb24.c', expect_)).toThrow('payload is not JSON');
  });

  it('rejects a payload that is JSON but not an object', () => {
    const token = `a.${Buffer.from('"nope"').toString('base64url')}.c`;
    expect(() => decodeIdToken(token, expect_)).toThrow('not an object');
  });

  it('rejects a foreign issuer', () => {
    const token = idToken({ iss: 'https://evil.test', aud: 'aud-1', nonce: 'n', sub: 'x' });
    expect(() => decodeIdToken(token, expect_)).toThrow('unexpected issuer');
  });

  it('rejects a token minted for another client', () => {
    const token = idToken({ iss: expect_.issuers[0], aud: 'someone-else', nonce: 'n', sub: 'x' });
    expect(() => decodeIdToken(token, expect_)).toThrow('not minted for this client');
  });

  it('rejects a token whose nonce belongs to another flow', () => {
    const token = idToken({ iss: expect_.issuers[0], aud: 'aud-1', nonce: 'other', sub: 'x' });
    expect(() => decodeIdToken(token, expect_)).toThrow('nonce does not match');
  });

  it('rejects a token with no subject', () => {
    const token = idToken({ iss: expect_.issuers[0], aud: 'aud-1', nonce: 'n', sub: '' });
    expect(() => decodeIdToken(token, expect_)).toThrow('no subject');
  });
});

describe('claim readers', () => {
  it('reads both the boolean and the string spelling of a yes', () => {
    expect(claimIsTrue(true)).toBe(true);
    // Apple's spelling. A strict === true here bounces every Apple sign-in.
    expect(claimIsTrue('true')).toBe(true);
  });

  it('treats anything else, including silence, as a no', () => {
    expect(claimIsTrue(false)).toBe(false);
    expect(claimIsTrue('yes')).toBe(false);
    expect(claimIsTrue(undefined)).toBe(false);
  });

  it('keeps only non-empty strings', () => {
    expect(claimString('Trillian')).toBe('Trillian');
    expect(claimString('   ')).toBeNull();
    expect(claimString(42)).toBeNull();
  });
});

describe('GoogleOAuthAdapter', () => {
  const adapter = new GoogleOAuthAdapter(OPTIONS);

  it('announces itself as a PKCE, query-string provider', () => {
    expect(adapter.name).toBe('google');
    expect(adapter.usesPkce).toBe(true);
    expect(adapter.usesFormPost).toBe(false);
  });

  it('builds an OIDC authorization url with state, nonce and the S256 challenge', () => {
    const url = new URL(
      adapter.authorizationUrl({ state: 'st', nonce: 'no', codeChallenge: 'ch' }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe('no');
    expect(url.searchParams.get('code_challenge')).toBe('ch');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(OPTIONS.redirectUri);
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('exchanges the code and reads the identity out of the id_token', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id_token: idToken(CLAIMS) }));

    await expect(
      adapter.exchange({ code: 'c0de', codeVerifier: 'verifier', nonce: 'nonce-1' }),
    ).resolves.toEqual({
      providerAccountId: '1092837465',
      email: 'ford@betelgeuse.dev',
      emailVerified: true,
      name: 'Ford Prefect',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = (init.body as URLSearchParams).toString();
    expect(body).toContain('code=c0de');
    expect(body).toContain('code_verifier=verifier');
    expect(body).toContain('grant_type=authorization_code');
  });

  it('reports an unverified address as unverified rather than assuming', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ id_token: idToken({ ...CLAIMS, email_verified: false }) }),
    );
    await expect(
      adapter.exchange({ code: 'c', codeVerifier: 'v', nonce: 'nonce-1' }),
    ).resolves.toMatchObject({ emailVerified: false });
  });

  it('refuses a token response with no id_token', async () => {
    fetchMock.mockResolvedValueOnce(ok({ access_token: 'only-this' }));
    await expect(adapter.exchange({ code: 'c', nonce: 'nonce-1' })).rejects.toThrow('no id_token');
  });

  it('turns a rejected exchange into an OAuthExchangeError', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) });
    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).rejects.toBeInstanceOf(
      OAuthExchangeError,
    );
  });

  it('turns a network failure into an OAuthExchangeError', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));
    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).rejects.toThrow('socket hang up');
  });

  it('turns a non-Error rejection into an OAuthExchangeError', async () => {
    fetchMock.mockRejectedValueOnce('nope');
    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).rejects.toThrow('request failed');
  });

  it('turns an unparseable body into an OAuthExchangeError', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('unexpected token');
      },
    });
    await expect(adapter.exchange({ code: 'c', nonce: 'n' })).rejects.toThrow('not JSON');
  });
});
