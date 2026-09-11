import { z } from 'zod';

/**
 * The modules a profile can be granted access to.
 *
 * **This is the list you edit per product.** It ships with the three modules
 * every SaaS has; add your own (`billing`, `projects`, `reports`, …) and the
 * permission matrix below follows. The API's `@RequirePermission()` decorator
 * takes one of these, so a typo is a compile error rather than an open door.
 */
export const permissionModules = ['settings', 'users', 'audit'] as const;
export const permissionModuleSchema = z.enum(permissionModules);
export type PermissionModule = (typeof permissionModules)[number];

export const permissionActions = [
  'read',
  'create',
  'update',
  'delete',
  'approve',
  'export',
] as const;
export const permissionActionSchema = z.enum(permissionActions);
export type PermissionAction = (typeof permissionActions)[number];

export const permissionDtoSchema = z.object({
  module: permissionModuleSchema,
  action: permissionActionSchema,
});
export type PermissionDto = z.infer<typeof permissionDtoSchema>;

/** Every action — what a profile with full command of a module gets. */
const FULL: readonly PermissionAction[] = permissionActions;
const READ_ONLY: readonly PermissionAction[] = ['read'];

type ProfileMatrix = Partial<Record<PermissionModule, readonly PermissionAction[]>>;

/**
 * The access table, in code.
 *
 * Reading rule: what is not here is not allowed. A profile gets exactly what
 * its row gives it — there is no implicit fallback, because an implicit
 * fallback in an access table is a permission nobody decided to grant.
 *
 * Two starter profiles ship with the boilerplate; add the ones your product
 * needs and keep `SYSTEM_PROFILES` in step.
 */
export const SYSTEM_PROFILE_PERMISSIONS: Record<string, ProfileMatrix> = {
  // Company administrator — everything, including settings and the audit trail.
  ADMIN: Object.fromEntries(permissionModules.map((m) => [m, FULL])) as ProfileMatrix,

  // Ordinary member — sees the company's settings, changes nothing, and never
  // reads the audit trail.
  MEMBER: {
    settings: READ_ONLY,
    users: READ_ONLY,
  },
};

/**
 * Profiles created when a company is onboarded. They are `system: true` in the
 * database and cannot be deleted — a company with no administrator profile
 * would be a company nobody can administer.
 */
export const SYSTEM_PROFILES = [
  { code: 'ADMIN', name: 'Administrator' },
  { code: 'MEMBER', name: 'Member' },
] as const;

/** Expands a matrix row into a set of `{module, action}` pairs. */
export function permissionsForProfile(code: string): PermissionDto[] {
  const matrix = SYSTEM_PROFILE_PERMISSIONS[code];
  if (!matrix) return [];
  const rows: PermissionDto[] = [];
  for (const module of permissionModules) {
    for (const action of matrix[module] ?? []) {
      rows.push({ module, action });
    }
  }
  return rows;
}
