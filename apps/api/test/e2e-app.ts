import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { ZodValidationPipe } from 'nestjs-zod';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import type { preHandlerHookHandler } from 'fastify';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infra/prisma/prisma.service';

/**
 * Boots the real AppModule on a Fastify adapter, wired the SAME way main.ts does
 * for the parts that matter to HTTP behaviour: `api` global prefix, the
 * ZodValidationPipe, the cookie plugin and the double-submit CSRF guard on
 * unsafe methods. We deliberately skip helmet/multipart/swagger/cors — none
 * affect the auth flows under test and they only slow boot.
 *
 * The CSRF guard IS registered (not skipped) so the tests exercise the real
 * path: fetch a token from GET /api/auth/csrf and echo it in `x-csrf-token`.
 */
export async function createE2EApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());

  await app.register(fastifyCookie, {
    secret: config.getOrThrow<string>('CSRF_SECRET'),
  });
  await app.register(fastifyCsrf, {
    cookieKey: 'csrf_token',
    cookieOpts: { signed: false, sameSite: 'lax', httpOnly: false, path: '/', secure: false },
    getToken: (req) => (req.headers['x-csrf-token'] as string | undefined) ?? '',
  });

  const fastify = app.getHttpAdapter().getInstance();
  const csrfProtection = (fastify as unknown as { csrfProtection: preHandlerHookHandler })
    .csrfProtection;
  fastify.addHook('preHandler', (req, reply, done) => {
    const m = req.method.toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return done();
    return csrfProtection.call(fastify, req, reply, done);
  });

  await app.init();
  // Fastify needs the plugin tree fully booted before the server can accept reqs.
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

/** Truncate every domain table so each test starts from a clean slate. */
export async function resetDb(prisma: PrismaService): Promise<void> {
  // CASCADE handles the FK graph; RESTART IDENTITY is harmless (uuid PKs).
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "two_factor_backup_codes", "email_verification_tokens", "password_reset_tokens", "refresh_tokens", "users" RESTART IDENTITY CASCADE',
  );
}
