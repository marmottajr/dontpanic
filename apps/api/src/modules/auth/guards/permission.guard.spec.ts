import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ProfilePermissionsService } from '../services/profile-permissions.service';
import { PermissionGuard } from './permission.guard';

/** A controller marked once at class level, plus the two exceptions to it. */
@RequirePermission('users')
class UsersController {
  /** Inherits `users` from the class; the action comes from the HTTP verb. */
  list() {}
  /** An explicit action on the method always wins over the class. */
  @RequirePermission('users', 'approve')
  approve() {}
  /** Public: the guard must not even look. */
  @Public()
  ping() {}
}

/** No decorator anywhere: authenticated, but carrying no profile restriction. */
class OpenController {
  health() {}
}

function makeContext(
  request: Record<string, unknown>,
  handler: unknown = UsersController.prototype.list,
  cls: unknown = UsersController,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

/** Prisma double returning the profile row the tenant-scoped read would find. */
function makePrisma(profile: unknown) {
  return {
    forTenant: jest.fn((_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user: { findUnique: () => Promise.resolve({ profile }) } }),
    ),
  };
}

function build(profile: unknown) {
  const prisma = makePrisma(profile);
  const service = new ProfilePermissionsService(prisma as never);
  return { guard: new PermissionGuard(new Reflector(), service), prisma };
}

const MEMBER_READ = {
  code: 'MEMBER',
  permissions: [
    { module: 'settings', action: 'read' },
    { module: 'users', action: 'read' },
  ],
};

/** An authenticated GET; `over` patches the user, tests patch `method` themselves. */
const request = (over: Record<string, unknown> = {}) => ({
  user: { id: 'u-1', email: 'member@dontpanic.dev', role: 'USER', tenantId: 't-1', ...over },
  method: 'GET',
});

describe('PermissionGuard', () => {
  it('lets the request through when the profile carries the permission', async () => {
    const { guard } = build(MEMBER_READ);
    await expect(guard.canActivate(makeContext(request()))).resolves.toBe(true);
  });

  it('forbids the request when the profile lacks the permission', async () => {
    const { guard } = build({ code: 'MEMBER', permissions: [{ module: 'audit', action: 'read' }] });
    await expect(guard.canActivate(makeContext(request()))).rejects.toThrow(
      'Your profile does not have access to this operation.',
    );
  });

  it('forbids a user with no profile at all — fails closed', async () => {
    const { guard } = build(null);
    await expect(guard.canActivate(makeContext(request()))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets the company ADMIN through without a single database read', async () => {
    const { guard, prisma } = build(null);
    await expect(guard.canActivate(makeContext(request({ role: 'ADMIN' })))).resolves.toBe(true);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('refuses the SUPERADMIN even though it is the most privileged role: the platform operator crosses tenants, so company routes are not its area (/api/platform/* is)', async () => {
    const { guard, prisma } = build(null);
    await expect(
      guard.canActivate(makeContext(request({ role: 'SUPERADMIN', tenantId: null }))),
    ).rejects.toThrow('The platform operator does not access company data.');
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('does not restrict a route without @RequirePermission(), but still resolves the profile', async () => {
    const { guard, prisma } = build(null);
    const context = makeContext(request(), OpenController.prototype.health, OpenController);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.forTenant).toHaveBeenCalledTimes(1);
  });

  it('skips a @Public() route entirely, before touching the database', async () => {
    const { guard, prisma } = build(null);
    const context = makeContext(request(), UsersController.prototype.ping, UsersController);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('leaves the decision to JwtAuthGuard when there is no user on the request', async () => {
    const { guard, prisma } = build(null);
    await expect(guard.canActivate(makeContext({ method: 'GET' }))).resolves.toBe(true);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('ignores non-http contexts', async () => {
    const { guard } = build(null);
    const context = { getType: () => 'rpc' } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  describe('action inferred from the HTTP verb', () => {
    const readOnly = () => build(MEMBER_READ);

    it.each([
      ['GET', true],
      ['HEAD', true],
      ['POST', false],
      ['PUT', false],
      ['PATCH', false],
      ['DELETE', false],
    ])('%s against a read-only profile: allowed=%s', async (method, allowed) => {
      const { guard } = readOnly();
      const context = makeContext({ ...request(), method });
      if (allowed) {
        await expect(guard.canActivate(context)).resolves.toBe(true);
      } else {
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it('matches the verb case-insensitively', async () => {
      const { guard } = readOnly();
      await expect(guard.canActivate(makeContext({ ...request(), method: 'get' }))).resolves.toBe(
        true,
      );
    });

    it('demands the write permission when the write verb is the one used', async () => {
      const { guard } = build({
        code: 'EDITOR',
        permissions: [{ module: 'users', action: 'update' }],
      });
      await expect(guard.canActivate(makeContext({ ...request(), method: 'PATCH' }))).resolves.toBe(
        true,
      );
      await expect(
        guard.canActivate(makeContext({ ...request(), method: 'DELETE' })),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('falls back to read for a verb that maps to nothing', async () => {
      const { guard } = readOnly();
      await expect(
        guard.canActivate(makeContext({ ...request(), method: 'OPTIONS' })),
      ).resolves.toBe(true);
    });
  });

  describe('an explicit action on the method overrides the class', () => {
    const approveContext = (over: Record<string, unknown> = {}) =>
      makeContext(
        { ...request(), method: 'GET', ...over },
        UsersController.prototype.approve,
        UsersController,
      );

    it('refuses a profile that only has the verb-inferred action', async () => {
      // GET would infer `read`, which this profile has — the method asks for `approve`.
      const { guard } = build(MEMBER_READ);
      await expect(guard.canActivate(approveContext())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('accepts the profile that has the declared action, whatever the verb', async () => {
      const { guard } = build({
        code: 'APPROVER',
        permissions: [{ module: 'users', action: 'approve' }],
      });
      await expect(guard.canActivate(approveContext())).resolves.toBe(true);
      await expect(guard.canActivate(approveContext({ method: 'POST' }))).resolves.toBe(true);
    });
  });

  it('resolves the profile once per request, however many times it is asked', async () => {
    const { guard, prisma } = build(MEMBER_READ);
    const req = request();
    await guard.canActivate(makeContext(req));
    await guard.canActivate(makeContext(req));
    expect(prisma.forTenant).toHaveBeenCalledTimes(1);
  });
});
