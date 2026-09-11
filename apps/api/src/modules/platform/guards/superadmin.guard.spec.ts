import { NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { SuperAdminGuard } from './superadmin.guard';

/** Minimal ExecutionContext: the guard only ever reads user, method and url. */
function makeContext(
  user: unknown,
  url = '/api/platform/tenants',
  method = 'GET',
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, url, method }) }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  const guard = new SuperAdminGuard();

  it('lets the SUPERADMIN — who belongs to no company — through', () => {
    expect(guard.canActivate(makeContext({ id: 'op-1', role: 'SUPERADMIN', tenantId: null }))).toBe(
      true,
    );
  });

  it.each(['USER', 'ADMIN'])(
    'answers 404 to a %s: a 403 would confirm the platform panel exists',
    (role) => {
      const context = makeContext({ id: 'u-1', role, tenantId: 'tenant-1' });

      expect(() => guard.canActivate(context)).toThrow(NotFoundException);
      // Not a ForbiddenException: "you may not" is itself information.
      try {
        guard.canActivate(context);
      } catch (error) {
        expect((error as NotFoundException).getStatus()).toBe(404);
      }
    },
  );

  it('answers 404 when there is no user at all, instead of leaking the route', () => {
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(NotFoundException);
  });

  it.each([
    ['GET', '/api/platform/tenants', 'Cannot GET /api/platform/tenants'],
    ['POST', '/api/platform/plans', 'Cannot POST /api/platform/plans'],
  ])(
    'copies Fastify’s own not-found wording byte for byte (%s), so "no such route" and "not for you" read identically',
    (method, url, expected) => {
      try {
        guard.canActivate(makeContext({ id: 'u-1', role: 'ADMIN' }, url, method));
        throw new Error('guard should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).message).toBe(expected);
      }
    },
  );

  it('upper-cases the verb so a lowercase method cannot be told apart from the real 404 either', () => {
    try {
      guard.canActivate(makeContext({ id: 'u-1', role: 'USER' }, '/api/platform/stats', 'get'));
      throw new Error('guard should have thrown');
    } catch (error) {
      expect((error as NotFoundException).message).toBe('Cannot GET /api/platform/stats');
    }
  });
});
