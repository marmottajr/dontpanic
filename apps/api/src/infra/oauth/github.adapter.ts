import {
  OAuthExchangeError,
  type OAuthAdapter,
  type OAuthAuthorizationRequest,
  type OAuthExchangeRequest,
  type OAuthIdentity,
} from '../../core/oauth/oauth.provider';
import { getJson, postForm } from './oauth-http';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';

/**
 * api.github.com refuses requests without a User-Agent — with a 403 whose body
 * explains it, which nothing surfaces once it is wrapped in a generic error.
 */
const USER_AGENT = 'DontPanic';

interface GitHubTokenResponse {
  access_token?: unknown;
  error?: unknown;
  error_description?: unknown;
}

interface GitHubUser {
  id?: unknown;
  name?: unknown;
  login?: unknown;
  email?: unknown;
}

interface GitHubEmail {
  email?: unknown;
  primary?: unknown;
  verified?: unknown;
}

export interface GitHubAdapterOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Sign in with GitHub — OAuth 2.0 and nothing more. There is no OIDC layer and
 * no id_token, so the identity has to be fetched with the access token: `/user`
 * for the subject and the display name, `/user/emails` for an address we are
 * allowed to trust.
 */
export class GitHubOAuthAdapter implements OAuthAdapter {
  readonly name = 'github' as const;
  readonly usesFormPost = false;
  /** GitHub's OAuth app flow has no PKCE; the state cookie is the whole defence. */
  readonly usesPkce = false;

  constructor(private readonly options: GitHubAdapterOptions) {}

  authorizationUrl(request: OAuthAuthorizationRequest): string {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      // `user:email` is what makes /user/emails readable. Without it the only
      // address available is the public profile one, which may be absent and
      // is never accompanied by a verification flag.
      scope: 'read:user user:email',
      state: request.state,
      // The nonce has nowhere to live in a flow with no id_token; the state
      // cookie already binds the round trip to this browser.
      allow_signup: 'false',
    }).toString();
    return url.toString();
  }

  async exchange(request: OAuthExchangeRequest): Promise<OAuthIdentity> {
    const token = await postForm<GitHubTokenResponse>(TOKEN_URL, {
      code: request.code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: this.options.redirectUri,
    });

    // GitHub answers a *failed* exchange with HTTP 200 and an `error` field, so
    // the usual status check sees success and the flow carries on with
    // `access_token: undefined`. Both halves have to be checked.
    if (typeof token.error === 'string' || typeof token.access_token !== 'string') {
      throw new OAuthExchangeError(
        `GitHub refused the code exchange: ${String(token.error ?? 'no access_token')}`,
      );
    }

    const headers = {
      authorization: `Bearer ${token.access_token}`,
      accept: 'application/vnd.github+json',
      'user-agent': USER_AGENT,
    };

    const [user, emails] = await Promise.all([
      getJson<GitHubUser>(USER_URL, headers),
      getJson<GitHubEmail[]>(EMAILS_URL, headers),
    ]);

    if (typeof user.id !== 'number' && typeof user.id !== 'string') {
      throw new OAuthExchangeError('GitHub returned a user without an id');
    }

    const verified = pickVerifiedPrimaryEmail(emails);

    return {
      // The numeric id is the immutable subject; the login handle is not — it
      // can be changed and then claimed by somebody else.
      providerAccountId: String(user.id),
      email: verified,
      emailVerified: verified !== null,
      name: firstString(user.name, user.login),
    };
  }
}

/**
 * The one address GitHub will vouch for: primary AND verified.
 *
 * Not "the first verified one" — a user may have several, and only the primary
 * is the one GitHub itself considers theirs. And never an unverified address:
 * GitHub lets anyone add any address to their account, so an unverified entry
 * is a claim by a stranger, not by GitHub.
 */
export function pickVerifiedPrimaryEmail(emails: unknown): string | null {
  if (!Array.isArray(emails)) return null;
  const primary = (emails as GitHubEmail[]).find(
    (entry) => entry?.primary === true && entry?.verified === true,
  );
  return typeof primary?.email === 'string' && primary.email !== '' ? primary.email : null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}
