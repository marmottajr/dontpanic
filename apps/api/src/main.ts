// Sentry must initialise before anything it instruments — keep this import first.
import './instrument';
import { randomUUID } from 'node:crypto';
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
import type { preHandlerHookHandler } from 'fastify';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
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
    return csrfProtection.call(fastify, req, reply, done);
  });

  // Multipart uploads (avatars). 5MB cap enforced at the parser, before sharp.
  await app.register(fastifyMultipart, {
    limits: { fileSize: 5_000_000, files: 1 },
  });

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
