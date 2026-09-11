import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TenantScopeInterceptor } from './tenant-scope.interceptor';

/**
 * Registers the interceptor that declares the tenant to Postgres on every
 * request. Global on purpose: a module that forgot to import it would run
 * without isolation, and that cannot be left to discipline.
 */
@Global()
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: TenantScopeInterceptor }],
})
export class TenancyModule {}
