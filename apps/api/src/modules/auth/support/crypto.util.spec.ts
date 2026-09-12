import { createHash } from 'node:crypto';
import { generateNumericCode, generateRawToken, sha256, verifyPassword } from './crypto.util';
import * as argon2 from 'argon2';

describe('crypto.util', () => {
  describe('generateRawToken', () => {
    it('produces a url-safe base64url token (no +, /, =)', () => {
      const token = generateRawToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('defaults to 32 bytes of entropy (43 base64url chars)', () => {
      // 32 bytes -> ceil(32/3)*4 = 44, minus padding stripped by base64url = 43.
      expect(generateRawToken().length).toBe(43);
    });

    it('honours a custom byte length', () => {
      const token = generateRawToken(16);
      // 16 bytes -> 22 base64url chars (no padding).
      expect(token.length).toBe(22);
    });

    it('is effectively unique across calls (high entropy)', () => {
      const tokens = new Set(Array.from({ length: 200 }, () => generateRawToken()));
      expect(tokens.size).toBe(200);
    });
  });

  describe('sha256', () => {
    it('matches the node crypto reference hash', () => {
      const expected = createHash('sha256').update('hello').digest('hex');
      expect(sha256('hello')).toBe(expected);
    });

    it('is deterministic', () => {
      expect(sha256('abc')).toBe(sha256('abc'));
    });

    it('produces a 64-char hex digest', () => {
      expect(sha256('anything')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('differs for different inputs (avalanche)', () => {
      expect(sha256('a')).not.toBe(sha256('b'));
    });
  });

  describe('generateNumericCode', () => {
    it('defaults to 6 digits', () => {
      expect(generateNumericCode()).toMatch(/^\d{6}$/);
    });

    it('honours a custom length and zero-pads', () => {
      const codes = Array.from({ length: 50 }, () => generateNumericCode(8));
      expect(codes.every((c) => /^\d{8}$/.test(c))).toBe(true);
    });

    it('varies across calls', () => {
      const set = new Set(Array.from({ length: 100 }, () => generateNumericCode()));
      expect(set.size).toBeGreaterThan(1);
    });
  });

  describe('verifyPassword', () => {
    // Hashing with real Argon2 is slow; these few calls are the point of the
    // test, so give them room rather than mocking the primitive away.
    jest.setTimeout(30_000);

    it('accepts the right password', async () => {
      const hash = await argon2.hash('correct horse battery staple');
      await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    });

    it('rejects the wrong password', async () => {
      const hash = await argon2.hash('correct horse battery staple');
      await expect(verifyPassword(hash, 'Tr0ub4dor&3')).resolves.toBe(false);
    });

    // The three shapes an absent credential arrives in. Each must be a refusal,
    // never "allowed because there was nothing to check" — that is the bug this
    // helper exists to make impossible to write by accident.
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
    ])('refuses when the stored hash is %s', async (_label, stored) => {
      await expect(verifyPassword(stored, 'anything at all')).resolves.toBe(false);
    });

    it('still pays the Argon2 cost when there is no hash', async () => {
      // The guarantee is that "no password" and "wrong password" cost the same,
      // so response timing cannot enumerate which accounts are social-only.
      //
      // argon2's exports are non-configurable, so the call cannot be spied on.
      // Time it instead — but against a measured baseline rather than a fixed
      // number of milliseconds, because a fixed threshold is exactly how a test
      // like this starts failing on a slow CI box for no real reason. A bare
      // `return false` would come back in microseconds; a real Argon2 verify
      // takes tens of milliseconds. An eighth of the baseline sits far below
      // the honest path and far above the shortcut, so only a regression that
      // actually removes the work can trip it.
      const hash = await argon2.hash('baseline');
      const startReal = performance.now();
      await verifyPassword(hash, 'wrong');
      const realCost = performance.now() - startReal;

      const startAbsent = performance.now();
      await verifyPassword(null, 'wrong');
      const absentCost = performance.now() - startAbsent;

      expect(absentCost).toBeGreaterThan(realCost / 8);
    });
  });
});
