import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { PrismaService } from '../prisma/prisma.service';
import { TenantContext, type TenantScope, type TenantStore } from './tenant-context';
import { SystemScope } from './system-scope.decorator';
import { TenantScopeInterceptor } from './tenant-scope.interceptor';

const tx = { name: 'tx' } as unknown as Prisma.TransactionClient;

interface PrismaDouble {
  withScope: jest.Mock;
  asSystem: jest.Mock;
}

/**
 * Stands in for PrismaService. It establishes the context store the way the
 * real `withScope` does, so a test can assert which scope the route ran under —
 * the interceptor deliberately does not open the store itself.
 */
function makePrisma(): PrismaDouble {
  const run = async (
    scope: TenantScope,
    fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<unknown> => TenantContext.run({ scope, tx }, () => fn(tx));

  return {
    withScope: jest.fn(
      (scope: TenantScope, fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        run(scope, fn),
    ),
    asSystem: jest.fn((fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      run({ kind: 'system' }, fn),
    ),
  };
}

function handler(): void {}
class TestController {}

function makeContext(options: {
  type?: string;
  request?: Record<string, unknown>;
}): ExecutionContext {
  return {
    getType: () => options.type ?? 'http',
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => options.request ?? {} }),
  } as unknown as ExecutionContext;
}

/** Handler that records the scope active at the moment the route runs. */
function makeNext(): { next: CallHandler; seen: () => TenantStore | undefined } {
  let seen: TenantStore | undefined;
  const next = {
    handle: jest.fn(() => {
      seen = TenantContext.get();
      return of('handled');
    }),
  } as unknown as CallHandler;
  return { next, seen: () => seen };
}

function makeInterceptor(
  prisma: PrismaDouble,
  systemScope?: boolean,
): { interceptor: TenantScopeInterceptor; reflector: { getAllAndOverride: jest.Mock } } {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(systemScope) };
  const interceptor = new TenantScopeInterceptor(
    prisma as unknown as PrismaService,
    reflector as unknown as Reflector,
  );
  return { interceptor, reflector };
}

const tenantUser: AuthUser = {
  id: 'u-1',
  email: 'a@b.com',
  role: 'ADMIN',
  tenantId: 'tenant-1',
};

describe('TenantScopeInterceptor', () => {
  it('leaves non-http contexts alone', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next } = makeNext();

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ type: 'rpc' }), next)),
    ).resolves.toBe('handled');
    expect(prisma.withScope).not.toHaveBeenCalled();
    expect(prisma.asSystem).not.toHaveBeenCalled();
  });

  it('opens a tenant scope from request.user', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next, seen } = makeNext();

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ request: { user: tenantUser } }), next)),
    ).resolves.toBe('handled');

    expect(prisma.withScope).toHaveBeenCalledTimes(1);
    expect(prisma.withScope.mock.calls[0][0]).toEqual({ kind: 'tenant', tenantId: 'tenant-1' });
    expect(seen()?.scope).toEqual({ kind: 'tenant', tenantId: 'tenant-1' });
  });

  it('opens the platform scope for a SUPERADMIN, even if the token carries a tenant', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next, seen } = makeNext();
    const user: AuthUser = { ...tenantUser, role: 'SUPERADMIN', tenantId: 'tenant-1' };

    await firstValueFrom(interceptor.intercept(makeContext({ request: { user } }), next));

    expect(prisma.withScope.mock.calls[0][0]).toEqual({ kind: 'platform' });
    expect(seen()?.scope).toEqual({ kind: 'platform' });
  });

  it('opens the platform scope for a SUPERADMIN with no tenant at all', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next } = makeNext();
    const user: AuthUser = { ...tenantUser, role: 'SUPERADMIN', tenantId: null };

    await firstValueFrom(interceptor.intercept(makeContext({ request: { user } }), next));

    expect(prisma.withScope.mock.calls[0][0]).toEqual({ kind: 'platform' });
  });

  it('takes the tenant only from the token, never from headers, query or body', async () => {
    // If the tenant came from the request, swapping one value would be enough
    // to read another company's data — this interceptor exists for that reason.
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next } = makeNext();
    const request = {
      user: tenantUser,
      headers: { 'x-tenant-id': 'tenant-evil' },
      query: { tenantId: 'tenant-evil' },
      body: { tenantId: 'tenant-evil' },
      params: { tenantId: 'tenant-evil' },
    };

    await firstValueFrom(interceptor.intercept(makeContext({ request }), next));

    expect(prisma.withScope.mock.calls[0][0]).toEqual({ kind: 'tenant', tenantId: 'tenant-1' });
  });

  it('ignores a forged tenant on an unauthenticated request instead of trusting it', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next, seen } = makeNext();
    const request = {
      headers: { 'x-tenant-id': 'tenant-evil' },
      query: { tenantId: 'tenant-evil' },
      body: { tenantId: 'tenant-evil' },
    };

    await firstValueFrom(interceptor.intercept(makeContext({ request }), next));

    expect(prisma.withScope).not.toHaveBeenCalled();
    expect(seen()).toBeUndefined();
  });

  it('runs an unauthenticated request with no scope at all', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next, seen } = makeNext();

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ request: {} }), next)),
    ).resolves.toBe('handled');

    expect(prisma.withScope).not.toHaveBeenCalled();
    expect(prisma.asSystem).not.toHaveBeenCalled();
    // With no scope, RLS returns no row at all: fail-closed.
    expect(seen()).toBeUndefined();
  });

  it('fails closed for a non-SUPERADMIN without a tenant: no scope is opened', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next, seen } = makeNext();
    const user: AuthUser = { ...tenantUser, tenantId: null };

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ request: { user } }), next)),
    ).resolves.toBe('handled');

    // Never degrade to 'system': that would be a way around the isolation.
    expect(prisma.withScope).not.toHaveBeenCalled();
    expect(prisma.asSystem).not.toHaveBeenCalled();
    expect(seen()).toBeUndefined();
  });

  it('fails closed for a user whose tenant is an empty string', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next } = makeNext();
    const user: AuthUser = { ...tenantUser, tenantId: '' };

    await firstValueFrom(interceptor.intercept(makeContext({ request: { user } }), next));

    expect(prisma.withScope).not.toHaveBeenCalled();
    expect(prisma.asSystem).not.toHaveBeenCalled();
  });

  it('runs a @SystemScope route through asSystem, without a tenant scope', async () => {
    const prisma = makePrisma();
    const { interceptor, reflector } = makeInterceptor(prisma, true);
    const { next, seen } = makeNext();

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ request: { user: tenantUser } }), next)),
    ).resolves.toBe('handled');

    expect(prisma.asSystem).toHaveBeenCalledTimes(1);
    expect(prisma.withScope).not.toHaveBeenCalled();
    // The tenant on the token is ignored entirely: a marked route runs system-wide.
    expect(seen()?.scope).toEqual({ kind: 'system' });
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('systemScope', [
      handler,
      TestController,
    ]);
  });

  it('reads @SystemScope through a real Reflector, from the method or the class', async () => {
    class Routes {
      @SystemScope()
      marked(): void {}
      plain(): void {}
    }
    @SystemScope()
    @Controller()
    class MarkedController {
      @Get()
      plain(): void {}
    }

    const prisma = makePrisma();
    const interceptor = new TenantScopeInterceptor(
      prisma as unknown as PrismaService,
      new Reflector(),
    );
    const context = (handlerFn: () => void, cls: unknown): ExecutionContext =>
      ({
        getType: () => 'http',
        getHandler: () => handlerFn,
        getClass: () => cls,
        switchToHttp: () => ({ getRequest: () => ({ user: tenantUser }) }),
      }) as unknown as ExecutionContext;

    await firstValueFrom(
      interceptor.intercept(context(Routes.prototype.marked, Routes), makeNext().next),
    );
    expect(prisma.asSystem).toHaveBeenCalledTimes(1);

    await firstValueFrom(
      interceptor.intercept(
        context(MarkedController.prototype.plain, MarkedController),
        makeNext().next,
      ),
    );
    expect(prisma.asSystem).toHaveBeenCalledTimes(2);

    await firstValueFrom(
      interceptor.intercept(context(Routes.prototype.plain, Routes), makeNext().next),
    );
    expect(prisma.asSystem).toHaveBeenCalledTimes(2);
    expect(prisma.withScope).toHaveBeenCalledTimes(1);
  });

  it('propagates a handler failure instead of swallowing it', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const next = {
      handle: () => throwError(() => new Error('route blew up')),
    } as unknown as CallHandler;

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ request: { user: tenantUser } }), next)),
    ).rejects.toThrow('route blew up');
  });

  it('propagates a failure from a @SystemScope route as well', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma, true);
    const next = {
      handle: () => throwError(() => new Error('login blew up')),
    } as unknown as CallHandler;

    await expect(
      firstValueFrom(interceptor.intercept(makeContext({ request: {} }), next)),
    ).rejects.toThrow('login blew up');
  });

  it('closes the scope once the request is done', async () => {
    const prisma = makePrisma();
    const { interceptor } = makeInterceptor(prisma);
    const { next } = makeNext();

    await firstValueFrom(
      interceptor.intercept(makeContext({ request: { user: tenantUser } }), next),
    );

    expect(TenantContext.get()).toBeUndefined();
  });
});
