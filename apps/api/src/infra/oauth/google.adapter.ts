import {
  OAuthExchangeError,
  type OAuthAdapter,
  type OAuthAuthorizationRequest,
  type OAuthExchangeRequest,
  type OAuthIdentity,
} from '../../core/oauth/oauth.provider';
import { claimIsTrue, claimString, decodeIdToken } from './id-token';
import { postForm } from './oauth-http';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Google publishes both spellings of its issuer and uses them interchangeably. */
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;

interface GoogleTokenResponse {
  id_token?: unknown;
}

export interface GoogleAdapterOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Sign in with Google — plain OIDC, which means the identity arrives inside the
 * `id_token` of the token response and we never call a userinfo endpoint.
 */
export class GoogleOAuthAdapter implements OAuthAdapter {
  readonly name = 'google' as const;
  readonly usesFormPost = false;
  readonly usesPkce = true;

  constructor(private readonly options: GoogleAdapterOptions) {}

  authorizationUrl(request: OAuthAuthorizationRequest): string {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      // `openid` is what makes this OIDC and produces the id_token; without it
      // Google answers with an access token and no identity at all.
      scope: 'openid email profile',
      state: request.state,
      nonce: request.nonce,
      code_challenge: request.codeChallenge ?? '',
      code_challenge_method: 'S256',
      // Without this Google silently reuses whichever account the browser is
      // already signed into, so a user with two accounts can never pick — and
      // the "wrong account" report that follows is impossible to reproduce.
      prompt: 'select_account',
    }).toString();
    return url.toString();
  }

  async exchange(request: OAuthExchangeRequest): Promise<OAuthIdentity> {
    const token = await postForm<GoogleTokenResponse>(TOKEN_URL, {
      code: request.code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      // Google re-checks the redirect_uri against the one that started the
      // flow. It is sent again here as proof, not as a destination — nothing is
      // redirected by this call.
      redirect_uri: this.options.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: request.codeVerifier ?? '',
    });

    if (typeof token.id_token !== 'string') {
      throw new OAuthExchangeError('Google returned no id_token');
    }

    const claims = decodeIdToken(token.id_token, {
      issuers: ISSUERS,
      audience: this.options.clientId,
      nonce: request.nonce,
    });

    return {
      providerAccountId: claims.sub as string,
      email: claimString(claims.email),
      emailVerified: claimIsTrue(claims.email_verified),
      name: claimString(claims.name),
    };
  }
}
