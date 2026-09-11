import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { makePrismaMock, type PrismaMock } from '../../../../test/prisma-mock';
import { TwoFactorGateGuard } from './two-factor-gate.guard';

function makeContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;
}

describe('TwoFactorGateGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: PrismaMock & { user: { findUnique: jest.Mock } };
  let config: { get: jest.Mock };
  let guard: TwoFactorGateGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    prisma = makePrismaMock({ user: { findUnique: jest.fn() } });
    config = { get: jest.fn().mockReturnValue(true) }; // required mode
    guard = new TwoFactorGateGuard(
      reflector as unknown as Reflector,
      prisma as never,
      config as never,
    );
  });

  it('is a no-op (no DB hit) when 2FA is not required', async () => {
    config.get.mockReturnValue(false);
    await expect(guard.canActivate(makeContext({ user: { id: 'u1' } }))).resolves.toBe(true);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('allows routes marked @SkipTwoFactorGate', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(makeContext({ user: { id: 'u1' } }))).resolves.toBe(true);
  });

  it('allows unauthenticated/public routes (no user)', async () => {
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
  });

  it('blocks an authenticated user without 2FA (403)', async () => {
    prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
    await expect(guard.canActivate(makeContext({ user: { id: 'u1' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows an authenticated user once 2FA is enabled', async () => {
    prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });
    await expect(guard.canActivate(makeContext({ user: { id: 'u1' } }))).resolves.toBe(true);
  });

  it('refuses when the scope cannot see the user at all (fail closed)', async () => {
    // Under RLS an unscoped read returns nothing, which used to look identical
    // to "no such user" and waved everyone through with 2FA required.
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext({ user: { id: 'u1' } }))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reads inside the user\u2019s own tenant scope, not the base client', async () => {
    prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });
    await guard.canActivate(makeContext({ user: { id: 'u1', tenantId: 't1' } }));
    // Guards run before interceptors, so the request transaction does not exist
    // yet: the guard has to open its own scope or it reads nothing.
    expect(prisma.forTenant).toHaveBeenCalledWith('t1', expect.any(Function));
  });

  it('reads in platform scope for a SUPERADMIN, who has no tenant', async () => {
    prisma.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });
    await guard.canActivate(makeContext({ user: { id: 'u1', role: 'SUPERADMIN' } }));
    expect(prisma.asPlatform).toHaveBeenCalled();
  });
});
