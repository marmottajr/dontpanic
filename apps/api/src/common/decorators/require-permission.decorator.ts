import { SetMetadata } from '@nestjs/common';
import type { PermissionAction, PermissionModule } from '@dontpanic/shared';

export const PERMISSION_KEY = 'requiredPermission';

export interface RequiredPermission {
  module: PermissionModule;
  /**
   * Absent means "infer from the HTTP verb": GET/HEAD → `read`, POST →
   * `create`, PUT/PATCH → `update`, DELETE → `delete`. That is what lets a
   * whole controller be marked with one line without a GET suddenly demanding
   * write access.
   */
  action?: PermissionAction;
}

/**
 * Requires a permission from the user's profile.
 *
 * Mark the class — it then applies to every route in the controller, with the
 * action inferred from the verb — or a method, which always wins over the
 * class. Use the method form when the action is not what the verb suggests: a
 * `POST :id/approve` is `approve`, not `create`, and a `POST /search` that only
 * reads is `read`.
 *
 * `PermissionGuard` enforces it. A route without this decorator carries no
 * profile restriction — it still requires a valid session and an active company.
 */
export const RequirePermission = (
  module: PermissionModule,
  action?: PermissionAction,
): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, { module, action } satisfies RequiredPermission);
