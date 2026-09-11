import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { PermissionAction } from '@dontpanic/shared';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import {
  PERMISSION_KEY,
  type RequiredPermission,
} from '../../../common/decorators/require-permission.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { ProfilePermissionsService, permits } from '../services/profile-permissions.service';

/** HTTP verb → action, for controllers marked with just the module. */
const ACTION_BY_METHOD: Record<string, PermissionAction> = {
  GET: 'read',
  HEAD: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

/**
 * Enforces `@RequirePermission()`.
 *
 * Runs after `JwtAuthGuard` (which fills `request.user` from a signed token)
 * and after `TenantStatusGuard`. It is registered globally but only acts where
 * the metadata is: a route without `@RequirePermission()` is not restricted.
 *
 * Three decisions worth spelling out:
 *
 * - **The company ADMIN always passes.** They administer the company and assign
 *   everyone else's profile; blocking them with their own table would let them
 *   lock themselves out of their own house.
 * - **The SUPERADMIN does not pass.** The platform operator belongs to no
 *   company and their request runs in platform scope (crossing tenants), so
 *   letting them into a business route would mean reading every company's data
 *   at once. Their area is `/api/platform/*`.
 * - **No profile, nothing.** A user without a `profileId` has no permissions —
 *   fail closed, never "everything by default".
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: ProfilePermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const user = request.user;
    if (!user) return true; // unauthenticated: JwtAuthGuard already decided

    const required = this.reflector.getAllAndOverride<RequiredPermission>(PERMISSION_KEY, targets);

    // Resolve the profile even without metadata: response interceptors may need
    // to know who is asking, and this way there is exactly one read per request.
    const resolved = await this.permissions.resolve(request);
    if (!required) return true;

    if (resolved.platformOperator) {
      throw new ForbiddenException('The platform operator does not access company data.');
    }

    const action = required.action ?? ACTION_BY_METHOD[request.method.toUpperCase()] ?? 'read';
    if (!permits(resolved, required.module, action)) {
      throw new ForbiddenException('Your profile does not have access to this operation.');
    }
    return true;
  }
}
