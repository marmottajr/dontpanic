/**
 * Reading and deleting the handful of cookies the browser is *meant* to see.
 *
 * Almost nothing here qualifies. The session cookies are httpOnly and
 * invisible to this code by design — that is the whole point of the BFF. What
 * is left is the occasional short-lived hand-off value that a redirect has no
 * other way to carry, and those are the only things these helpers should ever
 * touch.
 */

/** The value of `name`, or null when it is absent or unreadable. */
export function readCookie(name: string): string | null {
  // Guarded for the server render: this module is imported by client
  // components that Next also renders on the server, where `document` does not
  // exist and touching it throws during the build rather than at runtime.
  if (typeof document === 'undefined') return null;

  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split('; ')) {
    if (!part.startsWith(prefix)) continue;
    const raw = part.slice(prefix.length);
    try {
      return decodeURIComponent(raw);
    } catch {
      // A value that is not valid percent-encoding is not ours. Returning the
      // raw string would hand a caller something it cannot interpret; null is
      // the honest answer.
      return null;
    }
  }
  return null;
}

/**
 * Delete `name` from this origin.
 *
 * Expiry in the past is the only way to remove a cookie from script, and the
 * `path` has to match the one it was set with or the browser quietly keeps the
 * original — leaving a stale value that reads as live on the next visit. Every
 * cookie these helpers deal with is set at the root, so that is the default.
 */
export function clearCookie(name: string, path = '/'): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${encodeURIComponent(name)}=; Path=${path}; Max-Age=0; SameSite=Lax`;
}
