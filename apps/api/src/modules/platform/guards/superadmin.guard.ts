import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';

/**
 * The door to the platform panel. Only `role === 'SUPERADMIN'` gets in — the
 * SaaS operator, who belongs to no company.
 *
 * Answers **404, not 403**, on purpose: a 403 would confirm to an ordinary user
 * that the route exists, and the existence of the platform panel is not
 * information to hand to someone who does not operate it. The response is
 * byte-identical to Fastify's own not-found, so there is not even a difference
 * in wording between "no such route" and "not for you".
 *
 * Runs after the global JwtAuthGuard, so anyone unauthenticated already took a
 * 401 before reaching here — the 404 is only for valid sessions without rights.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const user = request.user;
    if (!user || user.role !== 'SUPERADMIN') {
      throw new NotFoundException(`Cannot ${request.method.toUpperCase()} ${request.url}`);
    }
    return true;
  }
}
