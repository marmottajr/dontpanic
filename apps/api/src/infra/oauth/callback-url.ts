import type { OAuthProvider } from '@dontpanic/shared';

/**
 * Where a provider sends the browser back, and where the state cookie has to
 * live so that it is still there when it arrives.
 *
 * **OAUTH_CALLBACK_BASE_URL points at the WEB origin, not the API's.** The
 * browser never talks to the API directly — everything goes through the BFF
 * proxy — so the URL registered with Google/Apple/GitHub looks like
 * `http://localhost:4200/api/auth/oauth` (the web port), never `:4201`. Point
 * it at the API and the provider will send the browser straight there, to an
 * origin that has none of our cookies: the state cookie was set on the web
 * origin, so it is not sent, and every single callback fails with
 * `?error=failed` and nothing in the logs to explain why.
 *
 * The same fact decides the cookie's `Path`. The cookie is written by the API
 * but lands in the browser under the web origin, so its Path must be the path
 * the *browser* will request — the pathname of this base URL — and not the
 * API's internal route. Get that wrong and the cookie exists but is never sent
 * back, which looks identical to a forged state.
 */
export function oauthCallbackUri(base: string, provider: OAuthProvider): string {
  return `${trimTrailingSlash(base)}/${provider}/callback`;
}

/**
 * The `Path` attribute for the short-lived state cookie: narrow enough that it
 * never rides along on ordinary API calls, wide enough to cover all three
 * callbacks. Derived from the same env value as the redirect URI, so the two
 * cannot drift apart.
 */
export function oauthCookiePath(base: string): string {
  try {
    const path = new URL(base).pathname;
    return trimTrailingSlash(path) || '/';
  } catch {
    // A base that is not a URL is a misconfiguration the boot check catches;
    // falling back to the conventional mount keeps this total.
    return '/api/auth/oauth';
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
