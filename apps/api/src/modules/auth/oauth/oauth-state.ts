import { createHash } from 'node:crypto';
import { oauthProviders, type OAuthProvider } from '@dontpanic/shared';

export const OAUTH_STATE_COOKIE = 'oauth_state';

/**
 * How long the user has between clicking the button and coming back. Long
 * enough for a password manager, a 2FA prompt at the provider and a consent
 * screen; short enough that an abandoned tab does not leave a usable flow
 * lying around.
 */
export const OAUTH_STATE_TTL_SECONDS = 600;

/** Which entry point started the flow. Changes the error wording, nothing else. */
export type OAuthIntent = 'login' | 'signup';

/**
 * Everything the callback needs to trust what came back, and nothing else.
 *
 * Short keys because it all rides in a cookie: PKCE verifiers are 43 characters
 * on their own, and browsers still enforce a ~4KB budget per cookie.
 */
export interface OAuthFlowState {
  /** Which provider started this. A callback for another one is not this flow. */
  p: OAuthProvider;
  /** The state parameter; the copy the provider echoes is compared to this. */
  s: string;
  /** The id_token nonce, checked at exchange time. */
  n: string;
  /** PKCE verifier, only for providers that support it. */
  v?: string;
  i: OAuthIntent;
}

export function encodeFlowState(state: OAuthFlowState): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

/**
 * Read the flow cookie back.
 *
 * Total: a cookie that is missing, truncated, from an older shape of this
 * struct, or simply garbage all answer null, and null is treated exactly like a
 * forged state. Anything that throws here would surface as a 500 on a route a
 * stranger can call at will.
 */
export function decodeFlowState(raw: string | undefined | null): OAuthFlowState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const candidate = parsed as Partial<OAuthFlowState>;
  if (
    typeof candidate.p !== 'string' ||
    !(oauthProviders as readonly string[]).includes(candidate.p)
  ) {
    return null;
  }
  if (typeof candidate.s !== 'string' || candidate.s === '') return null;
  if (typeof candidate.n !== 'string' || candidate.n === '') return null;
  if (candidate.v !== undefined && typeof candidate.v !== 'string') return null;

  return {
    p: candidate.p as OAuthProvider,
    s: candidate.s,
    n: candidate.n,
    ...(candidate.v ? { v: candidate.v } : {}),
    i: candidate.i === 'signup' ? 'signup' : 'login',
  };
}

/**
 * The S256 challenge for a PKCE verifier: base64url of the raw SHA-256 digest.
 *
 * Not the hex digest `sha256()` in crypto.util produces — that is the right
 * shape for a database index and the wrong one here, and a provider given hex
 * answers `invalid_grant` at exchange time, one step away from where the
 * mistake was made.
 */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
