import { OAuthExchangeError } from '../../core/oauth/oauth.provider';

/**
 * How long we wait on a provider before giving up.
 *
 * Generous compared to the captcha timeout, and on purpose: a token exchange
 * happens once per sign-in and cannot be retried (the code is single-use), so
 * abandoning it early costs the user the whole round trip. It is still bounded
 * — a hung provider must not hold a request open for ever.
 */
export const OAUTH_TIMEOUT_MS = 10_000;

/**
 * Every outbound call an adapter makes goes through here so that a provider's
 * bad day always looks the same to the caller: an OAuthExchangeError, which the
 * service turns into one opaque `?error=failed`.
 */
export async function postForm<T>(
  url: string,
  body: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
      ...extraHeaders,
    },
    body: new URLSearchParams(body),
  });
}

export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  return request<T>(url, { method: 'GET', headers: { accept: 'application/json', ...headers } });
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS) });
  } catch (err) {
    throw new OAuthExchangeError(
      `${url} did not answer: ${err instanceof Error ? err.message : 'request failed'}`,
    );
  }
  if (!response.ok) {
    throw new OAuthExchangeError(`${url} responded ${response.status}`);
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new OAuthExchangeError(`${url} answered with something that is not JSON`);
  }
}
