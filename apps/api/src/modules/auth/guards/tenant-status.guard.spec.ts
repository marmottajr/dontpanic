import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Public } from '../../../common/decorators/public.decorator';
import { SKIP_TENANT_STATUS_KEY, SkipTenantStatus, TenantStatusGuard } from './tenant-status.guard';

const DAY = 24 * 60 * 60 * 1000;

class SessionController {
  /** A normal, protected route. */
  list() {}
  /** Ending a session must work even for a company that is blocked. */
  @SkipTenantStatus()
  logout() {}
  @Public()
  health() {}
}

function makeContext(
  request: Record<string, unknown>,
  handler: unknown = SessionController.prototype.list,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => SessionController,
  } as unknown as ExecutionContext;
}

describe('TenantStatusGuard', () => {
  let prisma: { forTenant: jest.Mock };
  let guard: TenantStatusGuard;
  let tenantRow: Record<string, unknown> | null;

  beforeEach(() => {
    tenantRow = { status: 'ACTIVE', trialEndsAt: null, deletedAt: null };
    prisma = {
      forTenant: jest.fn((_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ tenant: { findUnique: () => Promise.resolve(tenantRow) } }),
      ),
    };
    guard = new TenantStatusGuard(new Reflector(), prisma as never);
  });

  const authed = (over: Record<string, unknown> = {}, handler?: unknown) =>
    makeContext(
      { user: { id: 'u-1', email: 'a@dontpanic.dev', role: 'USER', tenantId: 't-1', ...over } },
      handler,
    );

  it('lets a user of an active company through', async () => {
    await expect(guard.canActivate(authed())).resolves.toBe(true);
  });

  it('lets a company still inside its trial through', async () => {
    tenantRow = { status: 'TRIAL', trialEndsAt: new Date(Date.now() + DAY), deletedAt: null };
    await expect(guard.canActivate(authed())).resolves.toBe(true);
  });

  it('reads the company inside its own tenant scope, so RLS validates the JWT claim', async () => {
    await guard.canActivate(authed());
    expect(prisma.forTenant).toHaveBeenCalledWith('t-1', expect.any(Function));
  });

  it('refuses a suspended company', async () => {
    tenantRow = { status: 'SUSPENDED', trialEndsAt: null, deletedAt: null };
    await expect(guard.canActivate(authed())).rejects.toThrow(/suspended/i);
  });

  it('refuses a cancelled company', async () => {
    tenantRow = { status: 'CANCELED', trialEndsAt: null, deletedAt: null };
    await expect(guard.canActivate(authed())).rejects.toThrow(/cancelled/i);
  });

  it('refuses a company whose trial has ended', async () => {
    tenantRow = { status: 'TRIAL', trialEndsAt: new Date(Date.now() - DAY), deletedAt: null };
    await expect(guard.canActivate(authed())).rejects.toThrow(/trial has ended/i);
  });

  it('refuses a soft-deleted company', async () => {
    tenantRow = { status: 'ACTIVE', trialEndsAt: null, deletedAt: new Date() };
    await expect(guard.canActivate(authed())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a company the tenant-scoped read cannot find', async () => {
    tenantRow = null;
    await expect(guard.canActivate(authed())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a non-SUPERADMIN carrying no company', async () => {
    await expect(guard.canActivate(authed({ tenantId: null }))).rejects.toThrow(
      'Your account is not associated with any company.',
    );
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('lets the SUPERADMIN through — the platform operator belongs to no company', async () => {
    await expect(guard.canActivate(authed({ role: 'SUPERADMIN', tenantId: null }))).resolves.toBe(
      true,
    );
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('lets a @SkipTenantStatus() route through, so logging out always works', async () => {
    tenantRow = { status: 'SUSPENDED', trialEndsAt: null, deletedAt: null };
    await expect(guard.canActivate(authed({}, SessionController.prototype.logout))).resolves.toBe(
      true,
    );
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('lets a @Public() route through without touching the database', async () => {
    await expect(guard.canActivate(authed({}, SessionController.prototype.health))).resolves.toBe(
      true,
    );
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('leaves an unauthenticated request to JwtAuthGuard', async () => {
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('ignores non-http contexts', async () => {
    const context = { getType: () => 'ws' } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });
});

describe('@SkipTenantStatus()', () => {
  it('flags only the handler it is placed on', () => {
    const reflector = new Reflector();
    expect(reflector.get(SKIP_TENANT_STATUS_KEY, SessionController.prototype.logout)).toBe(true);
    expect(reflector.get(SKIP_TENANT_STATUS_KEY, SessionController.prototype.list)).toBeUndefined();
  });

  it('can mark a whole controller', () => {
    @SkipTenantStatus()
    class Ctrl {}
    expect(new Reflector().get(SKIP_TENANT_STATUS_KEY, Ctrl)).toBe(true);
  });
});
