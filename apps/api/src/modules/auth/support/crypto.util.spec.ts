import { createHash } from 'node:crypto';
import { generateRawToken, sha256 } from './crypto.util';

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
});
