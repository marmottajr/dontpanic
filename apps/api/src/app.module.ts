import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './config/env';
import { CACHE_PROVIDER, type CacheProvider } from './core/cache/cache.provider';
import { CacheThrottlerStorage } from './infra/throttler/cache-throttler.storage';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SENSITIVE_THROTTLE_KEY } from './common/decorators/sensitive-throttle.decorator';
import { CaptchaGuard } from './common/guards/captcha.guard';
import { PrismaModule } from './infra/prisma/prisma.module';
import { TenancyModule } from './infra/tenancy/tenancy.module';
import { CacheModule } from './infra/cache/cache.module';
import { QueueModule } from './infra/queue/queue.module';
import { StorageModule } from './infra/storage/storage.module';
import { MailModule } from './infra/mail/mail.module';
import { CaptchaModule } from './infra/captcha/captcha.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { OAuthModule } from './modules/auth/oauth/oauth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { TwoFactorGateGuard } from './modules/auth/guards/two-factor-gate.guard';
import { TenantStatusGuard } from './modules/auth/guards/tenant-status.guard';
import { PermissionGuard } from './modules/auth/guards/permission.guard';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { FilesModule } from './modules/files/files.module';
import { AdminModule } from './modules/admin/admin.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { PlatformModule } from './modules/platform/platform.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        return {
          pinoHttp: {
            // Silence request logging under test so e2e output stays readable;
            // info in prod, debug in dev.
            level: nodeEnv === 'test' ? 'silent' : nodeEnv === 'production' ? 'info' : 'debug',
            transport:
              nodeEnv === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      // Explicit even though empty: @nestjs/throttler 6.5 is built against Nest
      // 11, where ModuleMetadata['imports'] was optional. Under Nest 12 it is
      // required, and omitting it fails the stricter spec tsconfig.
      imports: [],
      inject: [ConfigService, CACHE_PROVIDER, Reflector],
      useFactory: (
        config: ConfigService<Env, true>,
        cache: CacheProvider,
        reflector: Reflector,
      ) => {
        // Routes tagged @SensitiveThrottle() get the tight budget; everything
        // else the roomy one. Buckets never mix: the throttler keys on
        // class+handler+ip, so each route already counts on its own.
        const isSensitive = (ctx: ExecutionContext): boolean =>
          reflector.getAllAndOverride<boolean>(SENSITIVE_THROTTLE_KEY, [
            ctx.getHandler(),
            ctx.getClass(),
          ]) ?? false;

        return {
          throttlers: [
            {
              ttl: (ctx: ExecutionContext) =>
                config.get(isSensitive(ctx) ? 'AUTH_RATE_LIMIT_WINDOW' : 'RATE_LIMIT_WINDOW', {
                  infer: true,
                }),
              limit: (ctx: ExecutionContext) =>
                config.get(isSensitive(ctx) ? 'AUTH_RATE_LIMIT_MAX' : 'RATE_LIMIT_MAX', {
                  infer: true,
                }),
            },
          ],
          // Distributed store: counters live in Redis (or memory in tests), so the
          // limit holds across multiple API instances instead of per-process.
          storage: new CacheThrottlerStorage(cache),
        };
      },
    }),
    PrismaModule,
    TenancyModule,
    CacheModule,
    QueueModule,
    StorageModule,
    MailModule,
    CaptchaModule,
    HealthModule,
    AuthModule,
    OAuthModule,
    TenantsModule,
    UsersModule,
    FilesModule,
    AdminModule,
    InvitationsModule,
    PlatformModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters, cheapest and most general first: throttle (pre-auth), then
    // prove you are human (one outbound call, only on tagged routes), then
    // authenticate, then check the company is allowed in at all, then 2FA, and
    // only then the fine-grained profile permission — which is the only one
    // that needs a database read.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CaptchaGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantStatusGuard },
    { provide: APP_GUARD, useClass: TwoFactorGateGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
