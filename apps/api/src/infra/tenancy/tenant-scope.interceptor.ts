import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { Observable, firstValueFrom, from } from 'rxjs';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantScope } from './tenant-context';
import { SYSTEM_SCOPE_KEY } from './system-scope.decorator';

/**
 * Opens, for every authenticated request, a transaction where the tenant scope
 * is declared to Postgres. It is the bridge between the JWT and the RLS policies.
 *
 * The tenant comes exclusively from `request.user`, which JwtAuthGuard fills in
 * from a signed token. Never from a header, query string or body — otherwise
 * swapping one value would be enough to read another company's data.
 *
 * Requests with no user (public routes) run with no scope: with RLS on, that
 * means seeing no tenant's data at all. The public routes that genuinely need
 * to read something ask for it explicitly through `PrismaService.asSystem`,
 * which makes them visible in code review.
 */
@Injectable()
export class TenantScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    // Authentication and company signup have to run outside the isolation —
    // see SystemScope. It is the only way to mark them, and they are few.
    const isSystemScope = this.reflector.getAllAndOverride<boolean>(SYSTEM_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isSystemScope) {
      return from(this.prisma.asSystem(() => firstValueFrom(next.handle())));
    }

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const user = request.user;
    if (!user) return next.handle();

    const scope: TenantScope | null =
      user.role === 'SUPERADMIN'
        ? { kind: 'platform' }
        : user.tenantId
          ? { kind: 'tenant', tenantId: user.tenantId }
          : // A non-SUPERADMIN without a tenant should not exist. Running it with
            // no scope means RLS returns nothing — fail-closed, as it should be.
            null;

    if (!scope) return next.handle();

    return from(
      this.prisma.withScope(scope, () => firstValueFrom(next.handle())),
    ) as Observable<unknown>;
  }
}
