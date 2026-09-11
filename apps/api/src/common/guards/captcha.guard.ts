import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import type { Env } from '../../config/env';
import { CAPTCHA_PROVIDER, type CaptchaProvider } from '../../core/captcha/captcha.provider';
import { CaptchaUnavailableError } from '../../infra/captcha/siteverify';
import { REQUIRE_CAPTCHA_KEY } from '../decorators/require-captcha.decorator';

/** Clients send the token in the body; the header is there for non-JSON callers. */
const TOKEN_HEADER = 'x-captcha-token';
const TOKEN_FIELD = 'captchaToken';

/**
 * Enforces @RequireCaptcha(). Runs after the throttler (so a flood is rejected
 * before it costs us a call to the provider) and before authentication.
 *
 * Failures are deliberately uniform — `CaptchaRequired` either way — so the
 * response never distinguishes "no token" from "token rejected" from "score too
 * low", which would otherwise be a free oracle for tuning a bot.
 */
@Injectable()
export class CaptchaGuard implements CanActivate {
  private readonly logger = new Logger(CaptchaGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
    @Inject(CAPTCHA_PROVIDER) private readonly captcha: CaptchaProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.captcha.enabled) return true;

    const action = this.reflector.getAllAndOverride<string | undefined>(REQUIRE_CAPTCHA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractToken(req);

    let result;
    try {
      result = await this.captcha.verify(token, { ip: req.ip, action });
    } catch (err) {
      if (!(err instanceof CaptchaUnavailableError)) throw err;
      // The provider is down, not the caller's fault. Fail closed by default:
      // letting everyone through would quietly remove the bot defence exactly
      // when nobody is watching.
      this.logger.error(`Captcha provider unreachable: ${err.message}`);
      if (this.config.get('CAPTCHA_FAIL_OPEN', { infer: true })) return true;
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'CaptchaUnavailable',
        message: 'Could not verify the captcha right now',
      });
    }

    if (!result.success) {
      this.logger.warn(
        `Captcha rejected for ${action} (score=${result.score ?? 'n/a'}, codes=${
          result.errors?.join(',') ?? 'none'
        })`,
      );
      throw new BadRequestException({
        statusCode: 400,
        error: 'CaptchaRequired',
        message: 'Captcha verification failed',
      });
    }

    return true;
  }

  private extractToken(req: FastifyRequest): string | null {
    const body = req.body as Record<string, unknown> | undefined;
    const fromBody = body?.[TOKEN_FIELD];
    if (typeof fromBody === 'string' && fromBody.length > 0) return fromBody;
    const fromHeader = req.headers[TOKEN_HEADER];
    if (typeof fromHeader === 'string' && fromHeader.length > 0) return fromHeader;
    return null;
  }
}
