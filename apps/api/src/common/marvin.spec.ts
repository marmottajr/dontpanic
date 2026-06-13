import { marvinQuip } from './marvin';

describe('marvinQuip', () => {
  it('returns a non-empty quip for every known status', () => {
    for (const status of [400, 401, 403, 404, 418, 429, 500]) {
      const quip = marvinQuip(status);
      expect(typeof quip).toBe('string');
      expect(quip.length).toBeGreaterThan(0);
    }
  });

  it('returns the deterministic fallback for an unknown status', () => {
    expect(marvinQuip(999)).toBe('Don’t Panic.');
    expect(marvinQuip(200)).toBe('Don’t Panic.');
    expect(marvinQuip(0)).toBe('Don’t Panic.');
  });

  it('is deterministic across calls (no Math.random)', () => {
    const first = marvinQuip(404);
    for (let i = 0; i < 50; i += 1) {
      expect(marvinQuip(404)).toBe(first);
    }
    expect(marvinQuip(500)).toBe(marvinQuip(500));
  });

  it('picks within the pool for a multi-quip status (404 % 2 = 0)', () => {
    expect(marvinQuip(404)).toBe('Not found. Much like my will to keep computing.');
  });
});
