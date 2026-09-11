import type { CaptchaVerifyResult } from '../../core/captcha/captcha.provider';

/**
 * Shape returned by both siteverify endpoints — Cloudflare deliberately mirrors
 * Google's, so one parser covers both. `score`/`action` are reCAPTCHA v3 only.
 */
interface SiteVerifyResponse {
  success?: boolean;
  score?: number;
  action?: string;
  'error-codes'?: string[];
}

export interface SiteVerifyOptions {
  endpoint: string;
  secret: string;
  token: string;
  ip?: string | null;
  timeoutMs: number;
  /** Thrown-through on network failure so the caller can decide fail-open/closed. */
}

export class CaptchaUnavailableError extends Error {}

/**
 * POST the token to the provider. Both APIs take the same form-encoded body and
 * are documented to answer in milliseconds, so a short timeout is right: a hung
 * provider must not hold a login request open.
 */
export async function siteVerify(
  options: SiteVerifyOptions,
): Promise<CaptchaVerifyResult & { action?: string }> {
  const body = new URLSearchParams({ secret: options.secret, response: options.token });
  if (options.ip) body.set('remoteip', options.ip);

  let payload: SiteVerifyResponse;
  try {
    const res = await fetch(options.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!res.ok) {
      throw new CaptchaUnavailableError(`siteverify responded ${res.status}`);
    }
    payload = (await res.json()) as SiteVerifyResponse;
  } catch (err) {
    if (err instanceof CaptchaUnavailableError) throw err;
    throw new CaptchaUnavailableError(
      err instanceof Error ? err.message : 'siteverify request failed',
    );
  }

  return {
    success: payload.success === true,
    score: payload.score,
    action: payload.action,
    errors: payload['error-codes'],
  };
}
