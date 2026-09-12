import type { OAuthProvider } from '@dontpanic/shared';

/**
 * Port for social sign-in.
 *
 * Deliberately free of Nest and of anything HTTP-server shaped: an adapter's
 * whole job is "build the URL the browser goes to" and "turn the code the
 * browser came back with into an identity". Cookies, redirects, sessions and
 * the database are the module's problem, not the provider's — which is what
 * lets the three adapters below be tested with nothing but a mocked `fetch`.
 */
export const OAUTH_REGISTRY = Symbol('OAUTH_REGISTRY');

/**
 * The only thing we take from a provider.
 *
 * `providerAccountId` is the subject — Google/Apple `sub`, GitHub's numeric id
 * — and it is what the account is keyed on. Never the e-mail: people change
 * those, and a recycled address is how one person inherits another's account.
 *
 * `emailVerified` is the provider's own claim, not ours. It is false whenever
 * the provider did not say yes, including when it said nothing at all: an
 * unconfirmed address would let anyone who can sign up there claim the
 * DontPanic user who owns it.
 */
export interface OAuthIdentity {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

export interface OAuthAuthorizationRequest {
  /** CSRF nonce for the round trip; echoed back and compared to the cookie. */
  state: string;
  /** Replay nonce bound into the id_token, for the providers that issue one. */
  nonce: string;
  /** S256 challenge, present only when `usesPkce`. */
  codeChallenge?: string;
}

export interface OAuthExchangeRequest {
  code: string;
  /** The PKCE verifier whose challenge was sent to `authorizationUrl`. */
  codeVerifier?: string;
  nonce: string;
  /**
   * Apple only, and only ever once: the `user` form field it posts back on the
   * very first authorization, carrying the name. Every later sign-in omits it.
   */
  formPostUser?: string | null;
}

export interface OAuthAdapter {
  readonly name: OAuthProvider;
  /**
   * True when the provider answers the callback with a POST body instead of a
   * query string. Apple does, because asking for name/email forces
   * `response_mode=form_post`; Google and GitHub come back on a GET.
   */
  readonly usesFormPost: boolean;
  /** Whether to generate a PKCE verifier for this provider at all. */
  readonly usesPkce: boolean;

  authorizationUrl(request: OAuthAuthorizationRequest): string;
  exchange(request: OAuthExchangeRequest): Promise<OAuthIdentity>;
}

/**
 * Only the providers this deployment has credentials for.
 *
 * A provider that is not configured is absent from the map rather than present
 * and disabled — that absence is what makes the route answer 404, and 404 is
 * the right answer: whether an operator bought a Google client id is not
 * information the login page owes a stranger.
 */
export type OAuthRegistry = ReadonlyMap<OAuthProvider, OAuthAdapter>;

/**
 * Anything that went wrong between us and the provider.
 *
 * Carries a message for the log and nothing for the browser: every failure
 * leaves through the same `?error=failed`, so a caller cannot use the
 * difference between "bad code" and "provider down" to calibrate.
 */
export class OAuthExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthExchangeError';
  }
}
