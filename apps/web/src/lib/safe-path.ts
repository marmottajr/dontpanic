/**
 * A safe internal path to redirect to, or `null`.
 *
 * The login's `?from=` comes from the address bar, so it is whatever anyone
 * cares to put there: an attacker sends a link to **our** login and, if the
 * destination isn't validated, the victim signs in with their credentials and
 * lands on the attacker's site — carrying the trust of having come from a
 * domain they know.
 *
 * Filtering by pattern isn't enough, and the reason is the browser. `//evil.com`
 * starts with a slash and is read as an absolute URL; so is `/\evil.com`,
 * because Chrome normalises the backslash to a slash in the authority position.
 * Every new rule plugs one case and leaves the next one undiscovered.
 *
 * So the decision isn't about the shape of the string: resolve the candidate
 * against the current origin and ask the browser itself where that ends up. If
 * it doesn't end up in the same place, it won't do.
 */
export function safeInternalPath(from: string | null | undefined, origin: string): string | null {
  if (!from) return null;
  try {
    const url = new URL(from, origin);
    if (url.origin !== new URL(origin).origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
