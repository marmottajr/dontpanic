import { createHash, randomBytes, randomInt } from 'node:crypto';
import * as argon2 from 'argon2';

/**
 * Opaque-token helpers. We hand the client a high-entropy *raw* token (in a URL
 * or cookie) but only ever persist its SHA-256 hash — so a leaked database can't
 * be replayed. SHA-256 (not Argon2) is correct here: these tokens are already
 * 256 bits of randomness, so they need no key-stretching, and lookups must be fast.
 */

/** Generate a URL-safe random token. 32 bytes = 256 bits of entropy. */
export function generateRawToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Deterministic SHA-256 hash (hex) used to index and compare opaque tokens. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Cryptographically-uniform numeric code (e.g. a 6-digit e-mail code). */
export function generateNumericCode(digits = 6): string {
  return randomInt(0, 10 ** digits)
    .toString()
    .padStart(digits, '0');
}

/**
 * A hash of something nobody knows, verified against when there is no real
 * credential to check. Computed once at module load.
 *
 * Its only job is to burn the same Argon2 time the real path burns, so that
 * "this account has no password" and "this password is wrong" take equally
 * long. Skipping the work would make the response time an oracle: an attacker
 * timing the login form could enumerate which addresses are social-only, which
 * is precisely the set worth phishing.
 */
const ABSENT_PASSWORD_HASH = argon2.hash(randomBytes(32).toString('hex'));

/**
 * Verify a password against a stored hash that may not exist.
 *
 * `passwordHash` is nullable since social sign-in arrived: an account created
 * through Google/Apple/GitHub has no password at all. Every caller that used to
 * pass a `string` now passes `string | null`, and the answer for null is always
 * **false** — never "allowed because there is nothing to check", which is the
 * shape this bug takes when each caller invents its own null handling.
 *
 * Callers must keep reporting the ordinary invalid-credentials error on false.
 * Saying "this account uses social sign-in" would hand back the oracle the
 * constant-time work above exists to deny.
 */
export async function verifyPassword(
  passwordHash: string | null | undefined,
  plain: string,
): Promise<boolean> {
  if (!passwordHash) {
    await argon2.verify(await ABSENT_PASSWORD_HASH, plain);
    return false;
  }
  return argon2.verify(passwordHash, plain);
}
