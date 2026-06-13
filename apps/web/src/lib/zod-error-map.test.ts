import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { applyZodI18n } from './zod-error-map';

// Stub translator: echoes the key (and any interpolation values) so we can
// assert which i18n key each Zod issue maps to.
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

function firstMessage(result: z.ZodSafeParseResult<unknown>) {
  return result.success ? null : result.error.issues[0]?.message;
}

describe('applyZodI18n', () => {
  beforeEach(() => applyZodI18n(t));
  afterEach(() => z.config({ customError: undefined }));

  it('maps an empty required string to "required"', () => {
    expect(firstMessage(z.string().min(1).safeParse(''))).toBe('required');
  });

  it('maps a missing value (invalid_type) to "required"', () => {
    expect(firstMessage(z.string().safeParse(undefined))).toBe('required');
  });

  it('maps a short password (min 8) to "passwordWeak"', () => {
    expect(firstMessage(z.string().min(8).safeParse('abc'))).toBe('passwordWeak');
  });

  it('maps a failed regex (password policy) to "passwordWeak"', () => {
    expect(firstMessage(z.string().regex(/[0-9]/).safeParse('abc'))).toBe('passwordWeak');
  });

  it('maps an invalid email to "email"', () => {
    expect(firstMessage(z.email().safeParse('nope'))).toBe('email');
  });

  it('maps a generic short string to "tooShort" with the minimum', () => {
    expect(firstMessage(z.string().min(3).safeParse('a'))).toContain('tooShort');
  });

  it('maps an over-long string to "tooLong" with the maximum', () => {
    expect(firstMessage(z.string().max(3).safeParse('toolong'))).toContain('tooLong');
  });

  it('falls through to the default for unmapped codes', () => {
    // not_multiple_of is not mapped -> Zod's own message is used
    const msg = firstMessage(z.number().multipleOf(2).safeParse(3));
    expect(typeof msg).toBe('string');
    expect(msg).not.toBe('required');
  });
});
