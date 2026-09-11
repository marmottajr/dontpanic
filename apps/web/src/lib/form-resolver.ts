import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';

/**
 * An empty text field reaches us as `''`, but the shared contracts say
 * `optional()`/`nullish()` — so that `''` would hit the validator instead of
 * being skipped (an empty postcode would come back as "must have 8 digits").
 * Before validating, blank is treated as "not filled in".
 */
export function blankToUndefined(value: unknown): unknown {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  // An empty `<input type="number">` read with `valueAsNumber` gives `NaN` —
  // that is also "not filled in", not an invalid number.
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  if (Array.isArray(value)) return value.map(blankToUndefined);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        blankToUndefined(item),
      ]),
    );
  }
  return value;
}

/**
 * A react-hook-form resolver bound to a schema from `@dontpanic/shared`, with
 * the blank cleanup above. The shared schema stays the single source of the
 * rule — all that happens here is the input being prepared.
 */
export function sharedResolver<TOutput extends FieldValues, TInput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
): Resolver<TInput, unknown, TOutput> {
  // `z.preprocess` widens the input to `unknown`; the resulting resolver still
  // accepts the form's values, hence the assertions.
  const prepared = z.preprocess(blankToUndefined, schema) as unknown as z.ZodType<TOutput, TInput>;
  return zodResolver(prepared) as unknown as Resolver<TInput, unknown, TOutput>;
}

/**
 * In a PATCH, an absent field means "leave it alone". To actually clear an
 * optional value, whoever emptied the field has to send an explicit `null` —
 * but only on the fields the contract accepts nulling (`nullish`), never on
 * plain `optional` ones, which would reject the `null`.
 */
export function withClearedFields<T extends Record<string, unknown>>(
  parsed: T,
  raw: Record<string, unknown>,
  nullableKeys: readonly string[],
): T {
  const out: Record<string, unknown> = { ...parsed };
  for (const key of nullableKeys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim() === '') out[key] = null;
  }
  return out as T;
}
