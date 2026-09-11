import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { SKIP_2FA_GATE_KEY } from '../../../common/decorators/skip-two-factor-gate.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';

/**
 * When TWO_FACTOR_REQUIRED is on, an authenticated user who hasn't enabled 2FA
 * can only reach the 2FA-setup essentials (marked @SkipTwoFactorGate); every
 * other route returns 403 until they enable it. Runs AFTER JwtAuthGuard, so
 * request.user is already populated. No-op (and no DB hit) when 2FA is optional.
 *
 * The lookup opens its own scoped transaction rather than using `prisma.db`,
 * and that is not a style choice: Nest runs guards BEFORE interceptors, so
 * `TenantScopeInterceptor` has not opened the request transaction yet. Reading
 * through `prisma.db` here would fall through to the unscoped base client,
 * where RLS returns no rows — the user would look absent and the gate would
 * wave everyone through with 2FA required. It fails closed instead: a user the
 * scope cannot see does not pass.
 */
@Injectable()
export class TwoFactorGateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.get('TWO_FACTOR_REQUIRED', { infer: true })) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_2FA_GATE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: AuthUser }>();
    const userId = req.user?.id;
    if (!userId) return true; // public / unauthenticated routes are gated elsewhere

    const tenantId = req.user?.tenantId;
    const read = (tx: { user: { findUnique: PrismaService['user']['findUnique'] } }) =>
      tx.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } });

    // A SUPERADMIN has no tenant, so it reads in platform scope; everyone else
    // in their own company's.
    const dbUser = await (tenantId
      ? this.prisma.forTenant(tenantId, read)
      : this.prisma.asPlatform(read));

    if (!dbUser || !dbUser.twoFactorEnabled) {
      throw new ForbiddenException('two_factor_setup_required');
    }
    return true;
  }
}
