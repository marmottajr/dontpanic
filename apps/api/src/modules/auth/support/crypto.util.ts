import { createHash, randomBytes, randomInt } from 'node:crypto';

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
