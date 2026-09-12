import { OAuthExchangeError } from '../../core/oauth/oauth.provider';

/**
 * The claims we read out of an OIDC id_token. Everything is optional because
 * the token is the provider's document, not ours, and a missing claim has to
 * be a refusal rather than a crash.
 */
export interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  nonce?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
  [claim: string]: unknown;
}

export interface IdTokenExpectation {
  /** Accepted `iss` values. Google publishes two spellings of its own. */
  issuers: readonly string[];
  /** Our client id. The token was minted for us or it is not ours to read. */
  audience: string;
  /** The nonce we put in the authorization request. */
  nonce: string;
}

/**
 * Read an id_token that arrived on the token endpoint's response.
 *
 * The signature is NOT verified, and that is defensible for exactly one reason:
 * this token did not come through the browser. We asked the provider's token
 * endpoint for it ourselves, server to server, over TLS with certificate
 * validation — the channel is what authenticates it. Fetching and rotating
 * JWKS to re-check a signature on a document we just received from its issuer
 * over an authenticated channel buys nothing.
 *
 * That reasoning collapses the moment an id_token reaches us any other way (a
 * query parameter, a form field, a client-side flow). If a future provider hands
 * one over through the browser, this function is the wrong tool: verify the
 * signature then, because there is no longer a channel vouching for it.
 *
 * `iss` and `aud` are still checked, because TLS proves who we talked to and
 * not what they said: a token minted for a different client id, or replayed
 * from another issuer's response, would otherwise be accepted.
 */
export function decodeIdToken(idToken: string, expect: IdTokenExpectation): IdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new OAuthExchangeError('id_token is not a JWT');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(parts[1] as string, 'base64url').toString('utf8'));
  } catch {
    throw new OAuthExchangeError('id_token payload is not JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new OAuthExchangeError('id_token payload is not an object');
  }
  const claims = parsed as IdTokenClaims;

  if (typeof claims.iss !== 'string' || !expect.issuers.includes(claims.iss)) {
    throw new OAuthExchangeError('id_token has an unexpected issuer');
  }

  // `aud` is a string for a single audience and an array for several. Both are
  // legal, so both are handled — treating the array case as a mismatch would
  // reject perfectly valid tokens on a provider's whim.
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expect.audience)) {
    throw new OAuthExchangeError('id_token was not minted for this client');
  }

  // The nonce ties this token to the authorization request that started in this
  // browser. Without it, a token obtained in some other session could be
  // replayed into ours.
  if (claims.nonce !== expect.nonce) {
    throw new OAuthExchangeError('id_token nonce does not match the request');
  }

  if (typeof claims.sub !== 'string' || claims.sub === '') {
    throw new OAuthExchangeError('id_token has no subject');
  }

  return claims;
}

/**
 * Read a boolean claim that may not be a boolean.
 *
 * Apple sends `email_verified` as the *string* `"true"`, Google as a real
 * boolean, and the OIDC spec allows either. A plain `=== true` therefore reads
 * every Apple sign-in as unverified and bounces it — and the failure looks like
 * a provider problem, not a parsing one, which is what makes it expensive.
 *
 * Anything that is not an explicit yes is a no: a missing claim means the
 * provider never vouched for the address.
 */
export function claimIsTrue(value: unknown): boolean {
  return value === true || value === 'true';
}

/** A claim we want as a non-empty string, or null. */
export function claimString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}
