import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

export interface AuthUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

/** Injects the authenticated user (populated by JwtAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: AuthUser }>();
    return request.user;
  },
);
