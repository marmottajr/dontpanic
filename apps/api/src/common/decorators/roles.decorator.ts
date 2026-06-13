import { SetMetadata } from '@nestjs/common';
import type { Role } from '@dontpanic/shared';

export const ROLES_KEY = 'roles';

/** Restrict a route to the given roles (enforced by RolesGuard). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
