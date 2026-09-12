import { createHash } from 'node:crypto';
import { decodeFlowState, encodeFlowState, pkceChallenge } from './oauth-state';
import { isOAuthFormPostCallback, registerOAuthFormPostParser, skipsCsrf } from './oauth-form-post';

describe('flow state cookie', () => {
  const state = { p: 'google' as const, s: 'st', n: 'no', v: 'ver', i: 'signup' as const };

  it('round-trips', () => {
    expect(decodeFlowState(encodeFlowState(state))).toEqual(state);
  });

  it('keeps a provider with no PKCE verifier out of the decoded shape', () => {
    const encoded = encodeFlowState({ p: 'apple', s: 'st', n: 'no', i: 'login' });
    expect(decodeFlowState(encoded)).toEqual({ p: 'apple', s: 'st', n: 'no', i: 'login' });
  });

  it('defaults an unrecognised intent to login rather than widening signup', () => {
    const encoded = Buffer.from(
      JSON.stringify({ p: 'github', s: 'st', n: 'no', i: 'whatever' }),
    ).toString('base64url');
    expect(decodeFlowState(encoded)?.i).toBe('login');
  });

  /**
   * Every one of these is treated exactly like a forged state by the caller.
   * What matters is that none of them throws: this runs on a route a stranger
   * can hit with any cookie they like.
   */
  it.each([
    ['no cookie at all', undefined],
    ['an empty cookie', ''],
    ['garbage', '!!!not-base64!!!'],
    ['valid base64 that is not JSON', Buffer.from('nope').toString('base64url')],
    ['JSON that is not an object', Buffer.from('"nope"').toString('base64url')],
    [
      'an unknown provider',
      Buffer.from(JSON.stringify({ p: 'facebook', s: 'a', n: 'b' })).toString('base64url'),
    ],
    ['no state', Buffer.from(JSON.stringify({ p: 'google', s: '', n: 'b' })).toString('base64url')],
    ['no nonce', Buffer.from(JSON.stringify({ p: 'google', s: 'a' })).toString('base64url')],
    [
      'a non-string verifier',
      Buffer.from(JSON.stringify({ p: 'google', s: 'a', n: 'b', v: 7 })).toString('base64url'),
    ],
  ])('answers null for %s', (_label, raw) => {
    expect(decodeFlowState(raw as string | undefined)).toBeNull();
  });
});

describe('pkceChallenge', () => {
  it('is base64url of the raw digest, not the hex one crypto.util produces', () => {
    const verifier = 'a-verifier';
    expect(pkceChallenge(verifier)).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(pkceChallenge(verifier)).not.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the Apple form_post exception', () => {
  it('matches only a POST to a callback route', () => {
    expect(isOAuthFormPostCallback('POST', '/api/auth/oauth/apple/callback')).toBe(true);
    expect(isOAuthFormPostCallback('post', '/api/auth/oauth/apple/callback?x=1')).toBe(true);
    expect(isOAuthFormPostCallback('GET', '/api/auth/oauth/apple/callback')).toBe(false);
  });

  it('does NOT cover complete-signup, which creates a company', () => {
    expect(skipsCsrf('POST', '/api/auth/oauth/complete-signup')).toBe(false);
    expect(skipsCsrf('POST', '/api/auth/login')).toBe(false);
  });

  it('parses the urlencoded body for the callback', () => {
    const parsers: Record<string, (req: unknown, body: unknown, done: unknown) => void> = {};
    registerOAuthFormPostParser({
      addContentTypeParser: (type: string, _opts: unknown, handler: never) => {
        parsers[type] = handler;
      },
    } as never);

    const parse = parsers['application/x-www-form-urlencoded'] as (
      req: { method: string; url: string },
      body: string,
      done: (err: Error | null, value?: unknown) => void,
    ) => void;

    const done = jest.fn();
    parse({ method: 'POST', url: '/api/auth/oauth/apple/callback' }, 'code=abc&state=xyz', done);
    expect(done).toHaveBeenCalledWith(null, { code: 'abc', state: 'xyz' });
  });

  it('keeps answering 415 to urlencoded everywhere else', () => {
    const parsers: Record<string, (req: unknown, body: unknown, done: unknown) => void> = {};
    registerOAuthFormPostParser({
      addContentTypeParser: (type: string, _opts: unknown, handler: never) => {
        parsers[type] = handler;
      },
    } as never);

    const parse = parsers['application/x-www-form-urlencoded'] as (
      req: { method: string; url: string },
      body: string,
      done: (err: Error | null, value?: unknown) => void,
    ) => void;

    const done = jest.fn();
    parse({ method: 'POST', url: '/api/users' }, 'role=SUPERADMIN', done);
    const [error] = done.mock.calls[0] as [Error & { statusCode?: number }];
    expect(error.statusCode).toBe(415);
  });
});
