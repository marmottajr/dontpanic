import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import { OAuthExchangeError } from '../../core/oauth/oauth.provider';
import {
  AppleOAuthAdapter,
  appleClientSecret,
  appleNameFromFormPost,
  normalizeApplePrivateKey,
} from './apple.adapter';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const ok = (payload: unknown) => ({ ok: true, json: async () => payload });

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const P8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function idToken(payload: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(payload)}.signature`;
}

const OPTIONS = {
  clientId: 'dev.dontpanic.web',
  teamId: 'TEAM123456',
  keyId: 'KEY7890AB',
  privateKey: P8,
  redirectUri: 'http://localhost:4200/api/auth/oauth/apple/callback',
};

const CLAIMS = {
  iss: 'https://appleid.apple.com',
  aud: OPTIONS.clientId,
  sub: '001234.abcdef.0001',
  nonce: 'nonce-1',
  email: 'arthur@dent.dev',
  // Apple's own spelling: the string, not the boolean.
  email_verified: 'true',
};

describe('normalizeApplePrivateKey', () => {
  it('turns the literal backslash-n a secret store hands back into real newlines', () => {
    const escaped = P8.trim().replace(/\n/g, '\\n');
    expect(normalizeApplePrivateKey(escaped)).toBe(P8.trim());
  });

  it('leaves a already-real PEM alone', () => {
    expect(normalizeApplePrivateKey(P8)).toBe(P8.trim());
  });
});

describe('appleClientSecret', () => {
  it('signs an ES256 JWT the way Apple asks for it', () => {
    const secret = appleClientSecret(OPTIONS, 1_700_000_000);
    const [rawHeader, rawPayload, rawSignature] = secret.split('.');

    const header = JSON.parse(Buffer.from(rawHeader as string, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const payload = JSON.parse(Buffer.from(rawPayload as string, 'base64url').toString()) as Record<
      string,
      unknown
    >;

    expect(header).toEqual({ alg: 'ES256', kid: OPTIONS.keyId, typ: 'JWT' });
    // iss is the TEAM, sub is the Services ID. Swapping them is the classic
    // invalid_client, and it reads exactly like a wrong client id.
    expect(payload.iss).toBe(OPTIONS.teamId);
    expect(payload.sub).toBe(OPTIONS.clientId);
    expect(payload.aud).toBe('https://appleid.apple.com');
    expect(payload.iat).toBe(1_700_000_000);
    expect(payload.exp).toBe(1_700_000_300);

    // The signature must be raw r‖s (64 bytes for P-256), not DER — Apple
    // rejects DER, and the JWS verifier below is what proves which we emitted.
    const signature = Buffer.from(rawSignature as string, 'base64url');
    expect(signature).toHaveLength(64);
    const verified = createVerify('SHA256')
      .update(`${rawHeader}.${rawPayload}`)
      .verify(
        {
          key: createPublicKey(publicKey.export({ type: 'spki', format: 'pem' })),
          dsaEncoding: 'ieee-p1363',
        },
        signature,
      );
    expect(verified).toBe(true);
  });

  it('defaults its clock to now', () => {
    const before = Math.floor(Date.now() / 1000);
    const payload = JSON.parse(
      Buffer.from(appleClientSecret(OPTIONS).split('.')[1] as string, 'base64url').toString(),
    ) as { iat: number };
    expect(payload.iat).toBeGreaterThanOrEqual(before);
  });

  it('says so plainly when the key is not a usable EC key', () => {
    expect(() => appleClientSecret({ ...OPTIONS, privateKey: 'not-a-key' })).toThrow(
      OAuthExchangeError,
    );
  });
});

describe('appleNameFromFormPost', () => {
  it('joins the first authorization’s first and last name', () => {
    expect(appleNameFromFormPost('{"name":{"firstName":"Arthur","lastName":"Dent"}}')).toBe(
      'Arthur Dent',
    );
  });

  it('copes with only half a name', () => {
    expect(appleNameFromFormPost('{"name":{"firstName":"Zaphod"}}')).toBe('Zaphod');
  });

  it('is null when the field is absent — every sign-in after the first', () => {
    expect(appleNameFromFormPost(null)).toBeNull();
    expect(appleNameFromFormPost(undefined)).toBeNull();
  });

  it('costs a display name, never a sign-in, when the field is malformed', () => {
    expect(appleNameFromFormPost('{oops')).toBeNull();
    expect(appleNameFromFormPost('{"name":{}}')).toBeNull();
  });
});

describe('AppleOAuthAdapter', () => {
  const adapter = new AppleOAuthAdapter(OPTIONS);

  it('is the only adapter that comes back on a POST, and does not use PKCE', () => {
    expect(adapter.name).toBe('apple');
    expect(adapter.usesFormPost).toBe(true);
    expect(adapter.usesPkce).toBe(false);
  });

  it('asks for form_post, because name/email scopes force it', () => {
    const url = new URL(adapter.authorizationUrl({ state: 'st', nonce: 'no' }));
    expect(url.origin + url.pathname).toBe('https://appleid.apple.com/auth/authorize');
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    expect(url.searchParams.get('scope')).toBe('name email');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('nonce')).toBe('no');
  });

  it('exchanges with a freshly signed client secret and keeps the one-shot name', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id_token: idToken(CLAIMS) }));

    await expect(
      adapter.exchange({
        code: 'c0de',
        nonce: 'nonce-1',
        formPostUser: '{"name":{"firstName":"Arthur","lastName":"Dent"}}',
      }),
    ).resolves.toEqual({
      providerAccountId: '001234.abcdef.0001',
      email: 'arthur@dent.dev',
      emailVerified: true,
      name: 'Arthur Dent',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams((init.body as URLSearchParams).toString());
    expect(body.get('client_secret')?.split('.')).toHaveLength(3);
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('has no name on a returning sign-in, which is Apple’s doing, not an error', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id_token: idToken(CLAIMS) }));
    await expect(adapter.exchange({ code: 'c', nonce: 'nonce-1' })).resolves.toMatchObject({
      name: null,
    });
  });

  it('refuses a token response with no id_token', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await expect(adapter.exchange({ code: 'c', nonce: 'nonce-1' })).rejects.toThrow('no id_token');
  });
});
