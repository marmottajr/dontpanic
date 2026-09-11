import { describe, expect, it } from 'vitest';
import { booleanQueryParam } from './primitives';

describe('booleanQueryParam', () => {
  it('converts the two literal strings', () => {
    expect(booleanQueryParam.parse('true')).toBe(true);
    expect(booleanQueryParam.parse('false')).toBe(false);
  });

  /**
   * The whole reason this schema exists. `z.coerce.boolean()` runs
   * `Boolean("false")`, which is `true` — a `?active=false` filter would
   * silently return the exact opposite of what was asked for. This test fails
   * if anyone goes back to coerce.
   */
  it('does not treat "false" as truthy', () => {
    expect(booleanQueryParam.parse('false')).not.toBe(true);
  });

  it('rejects anything that is not "true" or "false"', () => {
    for (const invalid of ['1', '0', 'yes', 'no', '', 'TRUE', 'False', 'null']) {
      expect(booleanQueryParam.safeParse(invalid).success).toBe(false);
    }
  });
});
