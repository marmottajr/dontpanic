import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Role } from '@dontpanic/shared';
import { RolesGuard } from './roles.guard';

function makeContext(user: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows the route when no @Roles() metadata is present', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(makeContext({ role: 'USER' }))).toBe(true);
  });

  it('allows the route when @Roles() is an empty array', () => {
    reflector.getAllAndOverride.mockReturnValue([] as Role[]);
    expect(guard.canActivate(makeContext({ role: 'USER' }))).toBe(true);
  });

  it('allows a user whose role is in the required set', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN'] as Role[]);
    expect(guard.canActivate(makeContext({ role: 'ADMIN' }))).toBe(true);
  });

  it('forbids a user whose role is not in the required set', () => {
    reflector.getAllAndOverride.mockReturnValue(['ADMIN'] as Role[]);
    expect(() => guard.canActivate(makeContext({ role: 'USER' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(makeContext({ role: 'USER' }))).toThrow(
      'Insufficient permissions',
    );
  });

  it('forbids when there is no authenticated user', () => {
    reflector.getAllAndOverride.mockReturnValue(['USER'] as Role[]);
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });
});
