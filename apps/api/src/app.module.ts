import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, type Env } from './config/env';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './infra/prisma/prisma.module';
import { CacheModule } from './infra/cache/cache.module';
import { StorageModule } from './infra/storage/storage.module';
import { MailModule } from './infra/mail/mail.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FilesModule } from './modules/files/files.module';
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
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('NODE_ENV', { infer: true }) === 'production' ? 'info' : 'debug',
          transport:
            config.get('NODE_ENV', { infer: true }) !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get('RATE_LIMIT_WINDOW', { infer: true }),
            limit: config.get('RATE_LIMIT_MAX', { infer: true }),
          },
        ],
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
