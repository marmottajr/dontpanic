import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { assertTenantAllowed } from '../support/tenant-access';

export const SKIP_TENANT_STATUS_KEY = 'skipTenantStatus';

/**
 * A narrow exception to the company-status block. Only for what a user of a
 * blocked company must still be able to do — end their session. Do not use it
 * to hand out access to data.
 */
export const SkipTenantStatus = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_TENANT_STATUS_KEY, true);

/**
 * Blocks users whose company is suspended, cancelled, or past its trial.
 *
 * Runs after JwtAuthGuard (which fills `request.user` from a signed token) and
 * before any controller, so it covers the whole API at once — it does not
 * depend on each module remembering. `@Public()` routes pass (there is no user
 * to derive a company from) and so does the SUPERADMIN: they are the platform
 * operator and belong to no company.
 *
 * The read runs in the tenant's own scope, which means Postgres confirms
 * through RLS that the JWT's company actually exists — a forged `tid` (which
 * would already require the signing key) finds no row and is refused.
 */
@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_STATUS_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const user = request.user;
    if (!user) return true; // unauthenticated: JwtAuthGuard already decided
    if (user.role === 'SUPERADMIN') return true;

    const tenantId = user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Your account is not associated with any company.');
    }

    const tenant = await this.prisma.forTenant(tenantId, (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { status: true, trialEndsAt: true, deletedAt: true },
      }),
    );
    assertTenantAllowed(tenant);
    return true;
  }
}
