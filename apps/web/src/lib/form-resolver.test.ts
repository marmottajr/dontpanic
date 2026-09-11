import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { blankToUndefined, sharedResolver, withClearedFields } from './form-resolver';

describe('blankToUndefined', () => {
  it('treats blank as "not filled in", all the way down', () => {
    expect(blankToUndefined('')).toBeUndefined();
    expect(blankToUndefined('   ')).toBeUndefined();
    expect(blankToUndefined('ana')).toBe('ana');
    expect(blankToUndefined(Number.NaN)).toBeUndefined();
    expect(blankToUndefined(7)).toBe(7);
    expect(blankToUndefined(null)).toBeNull();
    expect(blankToUndefined(undefined)).toBeUndefined();
    expect(blankToUndefined(true)).toBe(true);
    expect(blankToUndefined(['', 'x'])).toEqual([undefined, 'x']);
    expect(blankToUndefined({ a: '', b: { c: '' }, d: 'x' })).toEqual({
      a: undefined,
      b: { c: undefined },
      d: 'x',
    });
  });
});

describe('sharedResolver', () => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.email().optional(),
  });
  const options = { fields: {}, shouldUseNativeValidation: false } as never;

  it('lets an optional field left blank through', async () => {
    const resolver = sharedResolver(schema);
    const result = await resolver({ name: 'Ana', email: '' } as never, undefined, options);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ name: 'Ana' });
  });

  it('returns the shared schema error when the value is invalid', async () => {
    const resolver = sharedResolver(schema);
    const result = await resolver({ name: 'A', email: 'nope' } as never, undefined, options);
    expect(Object.keys(result.errors)).toEqual(expect.arrayContaining(['name', 'email']));
  });
});

describe('withClearedFields', () => {
  it('sends null only on the fields the user actually emptied', () => {
    const parsed = { name: 'Ana', email: undefined, phone: undefined };
    const raw = { name: 'Ana', email: '', phone: undefined };
    expect(withClearedFields(parsed, raw, ['email', 'phone', 'missing'])).toEqual({
      name: 'Ana',
      email: null,
      phone: undefined,
    });
  });

  it('leaves a filled-in nullable field alone', () => {
    expect(withClearedFields({ email: 'a@b.co' }, { email: 'a@b.co' }, ['email'])).toEqual({
      email: 'a@b.co',
    });
  });
});
