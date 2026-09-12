import { createPrivateKey, createSign } from 'node:crypto';
import {
  OAuthExchangeError,
  type OAuthAdapter,
  type OAuthAuthorizationRequest,
  type OAuthExchangeRequest,
  type OAuthIdentity,
} from '../../core/oauth/oauth.provider';
import { claimIsTrue, claimString, decodeIdToken } from './id-token';
import { postForm } from './oauth-http';

const AUTHORIZE_URL = 'https://appleid.apple.com/auth/authorize';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const ISSUER = 'https://appleid.apple.com';
/**
 * Apple caps the client secret at six months. Minutes is all we need — it is
 * minted for one exchange and thrown away — and a short life means a secret
 * that leaks out of a log is worthless by the time anyone reads it.
 */
const CLIENT_SECRET_TTL_SECONDS = 300;

interface AppleTokenResponse {
  id_token?: unknown;
}

/**
 * The `user` field Apple form-posts on the first authorization only.
 * `{"name":{"firstName":"Arthur","lastName":"Dent"},"email":"…"}`
 */
interface AppleFormPostUser {
  name?: { firstName?: unknown; lastName?: unknown };
}

export interface AppleAdapterOptions {
  /** The Services ID (e.g. `dev.dontpanic.web`) — NOT the App ID. */
  clientId: string;
  teamId: string;
  keyId: string;
  /** Contents of the .p8, PEM. Literal `\n` sequences are tolerated. */
  privateKey: string;
  redirectUri: string;
}

/**
 * Normalise the .p8 as it comes out of a secret store.
 *
 * Almost every secret manager (and every `.env` file) hands a multi-line PEM
 * back with the newlines written as the two characters `\` and `n`. Node's
 * key parser rejects that with a message about the DER header, which sends
 * people looking for a corrupt key rather than a quoting problem.
 */
export function normalizeApplePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

const b64url = (value: object): string =>
  Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

/**
 * Apple's `client_secret` is not a secret string — it is a JWT you sign.
 *
 * This is the single most surprising thing about Sign in with Apple: there is
 * no static credential to paste into the env. The token endpoint expects an
 * ES256 JWT signed with the .p8, `iss` the team, `sub` the Services ID, `aud`
 * Apple. Sending anything else answers `invalid_client`, which reads exactly
 * like a wrong client id.
 *
 * Signed with `node:crypto` rather than a JWT library because JWS wants the
 * ECDSA signature as raw r‖s (IEEE P1363), and Node will produce that directly
 * — the default DER encoding is what silently yields a token Apple rejects.
 */
export function appleClientSecret(
  options: Pick<AppleAdapterOptions, 'clientId' | 'teamId' | 'keyId' | 'privateKey'>,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const header = { alg: 'ES256', kid: options.keyId, typ: 'JWT' };
  const payload = {
    iss: options.teamId,
    iat: nowSeconds,
    exp: nowSeconds + CLIENT_SECRET_TTL_SECONDS,
    aud: ISSUER,
    sub: options.clientId,
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  let signature: Buffer;
  try {
    signature = createSign('SHA256')
      .update(signingInput)
      .sign({
        key: createPrivateKey(normalizeApplePrivateKey(options.privateKey)),
        dsaEncoding: 'ieee-p1363',
      });
  } catch (err) {
    throw new OAuthExchangeError(
      `OAUTH_APPLE_PRIVATE_KEY is not a usable EC key: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }

  return `${signingInput}.${signature.toString('base64url')}`;
}

/**
 * Sign in with Apple.
 *
 * Two things set it apart from the other two adapters, and both are Apple's
 * doing rather than ours: the client secret above, and `response_mode=form_post`
 * — mandatory once the scope asks for name or email, which is why the callback
 * route also accepts POST.
 */
export class AppleOAuthAdapter implements OAuthAdapter {
  readonly name = 'apple' as const;
  readonly usesFormPost = true;
  /**
   * Apple does not document PKCE for the web flow, and sending a challenge it
   * ignores would make the verifier look like protection nobody is checking.
   * The state cookie and the id_token nonce carry the flow instead.
   */
  readonly usesPkce = false;

  constructor(private readonly options: AppleAdapterOptions) {}

  authorizationUrl(request: OAuthAuthorizationRequest): string {
    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      scope: 'name email',
      state: request.state,
      nonce: request.nonce,
      // Asking for name/email forces this. Apple then POSTs the callback, and
      // a redirect URI registered against a GET-only handler 405s.
      response_mode: 'form_post',
    }).toString();
    return url.toString();
  }

  async exchange(request: OAuthExchangeRequest): Promise<OAuthIdentity> {
    const token = await postForm<AppleTokenResponse>(TOKEN_URL, {
      code: request.code,
      client_id: this.options.clientId,
      client_secret: appleClientSecret(this.options),
      redirect_uri: this.options.redirectUri,
      grant_type: 'authorization_code',
    });

    if (typeof token.id_token !== 'string') {
      throw new OAuthExchangeError('Apple returned no id_token');
    }

    const claims = decodeIdToken(token.id_token, {
      issuers: [ISSUER],
      audience: this.options.clientId,
      nonce: request.nonce,
    });

    return {
      providerAccountId: claims.sub as string,
      email: claimString(claims.email),
      // Apple sends this as the string "true". See `claimIsTrue`.
      emailVerified: claimIsTrue(claims.email_verified),
      // The id_token never carries a name. It exists only in the form field
      // Apple posts on the very first authorization for this Services ID —
      // revoke and re-authorize and it comes back, but an ordinary second
      // sign-in does not. Miss it and it is gone, so it is read here and
      // persisted by the caller rather than looked up later.
      name: appleNameFromFormPost(request.formPostUser),
    };
  }
}

/** Pull "First Last" out of Apple's one-shot `user` form field. */
export function appleNameFromFormPost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let parsed: AppleFormPostUser | null;
  try {
    parsed = JSON.parse(raw) as AppleFormPostUser | null;
  } catch {
    // A malformed field costs a display name, never a sign-in.
    return null;
  }
  const first = claimString(parsed?.name?.firstName);
  const last = claimString(parsed?.name?.lastName);
  const full = [first, last].filter(Boolean).join(' ').trim();
  return full === '' ? null : full;
}
