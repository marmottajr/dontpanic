import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { TokenService } from '../services/token.service';
import { ACCESS_COOKIE } from '../support/cookies';

/**
 * Global authentication gate. Routes flagged @Public() pass straight through;
 * everything else must carry a valid access_token cookie. On success it attaches
 * `request.user = { id, email, role }` for @CurrentUser() / RolesGuard.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthUser; cookies?: Record<string, string> }>();
    const token = request.cookies?.[ACCESS_COOKIE];
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        fam: payload.fam,
      };
      return true;
    } catch {
      // Expired or tampered token — say nothing useful to an attacker.
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}
