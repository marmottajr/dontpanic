import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import helmet from '@fastify/helmet';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
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
    cookieOpts: { signed: false, sameSite: 'lax', httpOnly: false, path: '/', secure: isProd },
    getToken: (req) => (req.headers['x-csrf-token'] as string | undefined) ?? '',
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
