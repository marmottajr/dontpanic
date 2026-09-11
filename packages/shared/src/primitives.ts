import { z } from 'zod';

/**
 * Leaf primitives shared across auth & user contracts. Kept dependency-free so
 * auth.ts and user.ts can both import them WITHOUT creating an import cycle
 * (a cycle here leaves a schema field `undefined` at module-eval time and blows
 * up zod's toJSONSchema during Swagger generation).
 */
export const emailSchema = z.string().email().max(255).toLowerCase();

/** Password policy shared by register / reset / change-password. */
// No hardcoded messages on purpose: the web app localises Zod errors via a
// client error map (apps/web/src/lib/zod-error-map.ts). Schema-level messages
// would override that map, so the policy text lives in the i18n catalogs.
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/)
  .regex(/[A-Z]/)
  .regex(/[0-9]/);

/**
 * Boolean coming from a query string.
 *
 * `z.coerce.boolean()` is wrong here: it applies `Boolean(value)`, and
 * `Boolean("false") === true` — so `?active=false` would silently return the
 * ACTIVE records, the exact opposite of what was asked. This schema accepts
 * only the two literal strings and converts by hand.
 */
export const booleanQueryParam = z.enum(['true', 'false']).transform((value) => value === 'true');
