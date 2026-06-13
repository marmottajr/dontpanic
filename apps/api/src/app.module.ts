import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './config/env';
import { CACHE_PROVIDER, type CacheProvider } from './core/cache/cache.provider';
import { CacheThrottlerStorage } from './infra/throttler/cache-throttler.storage';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './infra/prisma/prisma.module';
import { CacheModule } from './infra/cache/cache.module';
import { StorageModule } from './infra/storage/storage.module';
import { MailModule } from './infra/mail/mail.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { TwoFactorGateGuard } from './modules/auth/guards/two-factor-gate.guard';
import { UsersModule } from './modules/users/users.module';
import { FilesModule } from './modules/files/files.module';
import { AdminModule } from './modules/admin/admin.module';
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
      inject: [ConfigService, CACHE_PROVIDER],
      useFactory: (config: ConfigService<Env, true>, cache: CacheProvider) => ({
        throttlers: [
          {
            ttl: config.get('RATE_LIMIT_WINDOW', { infer: true }),
            limit: config.get('RATE_LIMIT_MAX', { infer: true }),
          },
        ],
        // Distributed store: counters live in Redis (or memory in tests), so the
        // limit holds across multiple API instances instead of per-process.
        storage: new CacheThrottlerStorage(cache),
      }),
    }),
    PrismaModule,
    CacheModule,
    StorageModule,
    MailModule,
    HealthModule,
    AuthModule,
    UsersModule,
    FilesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: throttle first (cheap, pre-auth), then authenticate.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TwoFactorGateGuard },
  ],
})
export class AppModule {}
