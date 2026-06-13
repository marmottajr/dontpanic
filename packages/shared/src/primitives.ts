import { z } from 'zod';

/**
 * Leaf primitives shared across auth & user contracts. Kept dependency-free so
 * auth.ts and user.ts can both import them WITHOUT creating an import cycle
 * (a cycle here leaves a schema field `undefined` at module-eval time and blows
 * up zod's toJSONSchema during Swagger generation).
 */
export const emailSchema = z.string().email().max(255).toLowerCase();

/** Password policy shared by register / reset / change-password. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9]/, 'Must contain a number');
