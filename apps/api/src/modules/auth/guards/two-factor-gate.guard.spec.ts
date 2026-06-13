import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
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
  let prisma: { user: { findUnique: jest.Mock } };
  let config: { get: jest.Mock };
  let guard: TwoFactorGateGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    prisma = { user: { findUnique: jest.fn() } };
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
});
