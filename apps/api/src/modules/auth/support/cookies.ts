import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { Env } from '../../../config/env';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/** Refresh cookie is scoped to the auth routes only — it never rides on normal API calls. */
const REFRESH_PATH = '/api/auth';
const ACCESS_PATH = '/';

/**
 * Single place that knows how auth cookies are shaped. Both tokens are httpOnly
 * (JS can't read them — XSS can't steal them), Secure per COOKIE_SECURE, and
 * SameSite=lax so top-level navigations work while CSRF stays mitigated.
 */
@Injectable()
export class CookieService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private base(path: string, maxAgeSeconds: number): CookieSerializeOptions {
    return {
      httpOnly: true,
      // Always Secure in production regardless of the flag; COOKIE_SECURE only
      // lets non-prod opt in. Keeps auth cookies in lockstep with the csrf cookie.
      secure:
        this.config.get('COOKIE_SECURE', { infer: true }) ||
        this.config.get('NODE_ENV', { infer: true }) === 'production',
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path,
      maxAge: maxAgeSeconds,
    };
  }

  /**
   * The access cookie's `maxAge` tracks the **session** (the refresh TTL), not
   * the lifetime of the JWT it carries. What decides whether an access token is
   * still good is its signed `exp`, checked by the API — the cookie expiring
   * early buys no security, it only makes the browser drop the cookie while the
   * session is still renewable, which the Next proxy then reads as "logged out".
   */
  setAccessCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(
      ACCESS_COOKIE,
      token,
      this.base(ACCESS_PATH, this.config.get('JWT_REFRESH_TTL', { infer: true })),
    );
  }

  setRefreshCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(
      REFRESH_COOKIE,
      token,
      this.base(REFRESH_PATH, this.config.get('JWT_REFRESH_TTL', { infer: true })),
    );
  }

  clearAuthCookies(reply: FastifyReply): void {
    const domain = this.config.get('COOKIE_DOMAIN', { infer: true });
    reply.clearCookie(ACCESS_COOKIE, { path: ACCESS_PATH, domain });
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_PATH, domain });
  }
}
