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

    const dbUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorEnabled: true },
    });
    if (dbUser && !dbUser.twoFactorEnabled) {
      throw new ForbiddenException('two_factor_setup_required');
    }
    return true;
  }
}
