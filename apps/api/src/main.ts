// .env first, then Sentry (which reads it), then everything they instrument.
import './load-env';
import './instrument';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import helmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { preHandlerHookHandler } from 'fastify';
import { AppModule } from './app.module';
import { parseTrustProxy, type Env } from './config/env';
import { localStaticPrefix } from './infra/storage/local-static';
import { registerOAuthFormPostParser, skipsCsrf } from './modules/auth/oauth/oauth-form-post';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Who may set X-Forwarded-For. The rate limiter buckets on the resulting
      // req.ip, so `true` here (trust everyone) would let any caller forge the
      // header and mint a fresh bucket per request. Read straight from
      // process.env: the adapter is built before ConfigService exists.
      trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
      // Honour an inbound x-request-id (from an upstream proxy) or mint one, so
      // every log line and error envelope shares a single correlation id.
      requestIdHeader: 'x-request-id',
      genReqId: () => randomUUID(),
    }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  const config = app.get(ConfigService) as ConfigService<Env, true>;
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableShutdownHooks();

  // --- security ---
  await app.register(helmet, {
    contentSecurityPolicy: isProd ? undefined : false,
  });
  await app.register(fastifyCookie, {
    secret: config.getOrThrow<string>('CSRF_SECRET'),
  });
  await app.register(fastifyCsrf, {
    cookieKey: 'csrf_token',
    cookieOpts: {
      signed: false,
      sameSite: 'lax',
      httpOnly: false,
      path: '/',
      // Keep the csrf cookie's Secure decision in lockstep with the auth cookies
      // (COOKIE_SECURE || production) so all three cookie families agree.
      secure: config.get('COOKIE_SECURE', { infer: true }) || isProd,
    },
    getToken: (req) => (req.headers['x-csrf-token'] as string | undefined) ?? '',
  });

  // Registering the plugin only DECORATES the instance with `csrfProtection`; it
  // does nothing until attached. Enforce double-submit on every unsafe method.
  // preHandler (not onRequest) so the token may also arrive in the parsed body.
  const fastify = app.getHttpAdapter().getInstance();

  // Echo the correlation id back so clients and proxies can stitch logs together.
  fastify.addHook('onRequest', (req, reply, done) => {
    void reply.header('x-request-id', req.id);
    done();
  });

  const csrfProtection = (fastify as unknown as { csrfProtection: preHandlerHookHandler })
    .csrfProtection;
  fastify.addHook('preHandler', (req, reply, done) => {
    const m = req.method.toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return done();
    // Sign in with Apple posts its callback from appleid.apple.com, which has
    // no way to carry our double-submit token. That flow is guarded by the
    // OAuth `state` cookie instead — see skipsCsrf for why that is equivalent
    // and why the exemption is one method on one path.
    if (skipsCsrf(m, req.url)) return done();
    return csrfProtection.call(fastify, req, reply, done);
  });

  // Apple's form_post body. Every other route keeps answering 415 to urlencoded.
  registerOAuthFormPostParser(fastify);

  // Multipart uploads (avatars). 5MB cap enforced at the parser, before sharp.
  await app.register(fastifyMultipart, {
    limits: { fileSize: 5_000_000, files: 1 },
  });

  // Only for STORAGE_DRIVER=local. With `s3` the files live in a bucket and
  // mounting a directory here would be a static-file surface serving nothing —
  // an open door with no reason to be open. With `local` it is the other half
  // of the driver: LocalStorageAdapter writes into LOCAL_STORAGE_DIR and hands
  // back URLs under LOCAL_STORAGE_PUBLIC_URL, and without this registration
  // those URLs answered 404, which made the "ready-made alternative" the docs
  // advertise simply not work.
  if (config.get('STORAGE_DRIVER', { infer: true }) === 'local') {
    await app.register(fastifyStatic, {
      root: resolve(config.get('LOCAL_STORAGE_DIR', { infer: true })),
      prefix: localStaticPrefix(config.get('LOCAL_STORAGE_PUBLIC_URL', { infer: true })),
      // The directory holds what users uploaded, so serve files and nothing
      // else: no directory listing, no index fallback, no dotfiles.
      index: false,
      list: false,
      serveDotFiles: false,
      // The reply decorator is global and would collide with any other plugin
      // that wants `reply.sendFile`; this mount only needs the route.
      decorateReply: false,
    });
  }

  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // --- Swagger ---
  const swaggerConfig = new DocumentBuilder()
    .setTitle('DontPanic API')
    .setDescription("The answer to building any system. Don't Panic.")
    .setVersion('1.0.0')
    .addCookieAuth('access_token')
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, swaggerConfig));
  SwaggerModule.setup('docs', app, document);

  const port = config.get('API_PORT', { infer: true });
  const host = config.get('API_HOST', { infer: true });
  await app.listen(port, host);
  app
    .get(Logger)
    .log(`🚀 DontPanic API on http://${host}:${port}/api · docs at /docs · Don't Panic.`);
}

void bootstrap();
