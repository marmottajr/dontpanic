import { oauthProviders, type OAuthProvider } from '@dontpanic/shared';

/**
 * The two halves of the auth surface that a deployment can switch off.
 *
 * Same trap as the captcha (see `./captcha.ts` and the CLAUDE.md section):
 * these are the **web** halves of settings the API also reads, and the two have
 * to agree.
 *
 *  - `NEXT_PUBLIC_SIGNUP_ENABLED` vs the API's `SIGNUP_ENABLED`. If the web
 *    still renders the form while the API has signup off, every submit comes
 *    back 403 for a screen that gave no hint it was pointless to fill in.
 *  - `NEXT_PUBLIC_OAUTH_PROVIDERS` vs the providers the API actually has keys
 *    for. A button rendered for a provider the API does not know navigates to
 *    `/api/auth/oauth/<provider>/start` and lands on a 404 — the user sees a
 *    broken page, not a login.
 *
 * Nothing secret lives here: only the `NEXT_PUBLIC_*` half reaches the browser,
 * exactly as with the captcha's site key vs. secret key split.
 *
 * Both are read once, at module load: Next inlines `process.env.NEXT_PUBLIC_*`
 * at build time, so the full member access has to stay literal for the
 * substitution to happen.
 */

/** Anything but an explicit "off" is on — an absent variable means enabled. */
function readFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  // Unrecognised value: keep the default rather than guessing. A typo in the
  // env must not silently flip a gate in either direction.
  return fallback;
}

/**
 * Whether public self-serve registration is offered.
 *
 * Defaults to **true** because that is what a fresh clone wants: the very first
 * company has to be able to create itself. A product that only onboards by
 * invitation sets this to `false` in both halves.
 */
export const signupEnabled = readFlag(process.env.NEXT_PUBLIC_SIGNUP_ENABLED, true);

/**
 * The social providers this deployment shows buttons for.
 *
 * Order comes from the shared `oauthProviders` constant, not from the order
 * someone happened to type in the env: the buttons must not reshuffle between
 * deployments (or between two builds of the same one), because a button that
 * moves is a button people click by mistake.
 *
 * Unknown names are dropped instead of rendered. A typo (`googel`) would
 * otherwise become a button pointing at a route that answers 404.
 */
export function parseOAuthProviders(raw: string | undefined): OAuthProvider[] {
  const wanted = new Set(
    (raw ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry !== ''),
  );
  return oauthProviders.filter((provider) => wanted.has(provider));
}

export const enabledOAuthProviders: OAuthProvider[] = parseOAuthProviders(
  process.env.NEXT_PUBLIC_OAUTH_PROVIDERS,
);

/** Empty list = no social sign-in at all, and no orphan "or" separator. */
export const oauthEnabled = enabledOAuthProviders.length > 0;

/**
 * Where a social button sends the browser.
 *
 * This is a **navigation**, never a fetch: the endpoint answers 302 to the
 * provider's consent screen, and an XHR would follow the redirect in the
 * background, hand us an opaque cross-origin response and drop the user's
 * session cookie round-trip on the floor. Use it as an `<a href>` or a
 * `window.location.href` assignment.
 *
 * It goes through the BFF (`/api/...`) like everything else — the browser never
 * talks to the API's origin directly.
 */
export function oauthStartUrl(provider: OAuthProvider, intent: 'login' | 'signup'): string {
  return `/api/auth/oauth/${provider}/start?intent=${intent}`;
}
