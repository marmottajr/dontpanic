import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Role } from '@dontpanic/shared';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  /** The user's company. Null only for SUPERADMIN, who belongs to none. */
  tenantId?: string | null;
  /** Rotation family of the current session (from the access token's `fam`). */
  fam?: string;
}

/** Injects the authenticated user (populated by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: AuthUser }>();
    return request.user;
  },
);
