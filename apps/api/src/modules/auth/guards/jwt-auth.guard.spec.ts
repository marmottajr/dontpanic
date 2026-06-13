import { UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ACCESS_COOKIE } from '../support/cookies';
import { JwtAuthGuard } from './jwt-auth.guard';

function makeContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;
}

describe('JwtAuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let tokenService: { verifyAccessToken: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    tokenService = { verifyAccessToken: jest.fn() };
    guard = new JwtAuthGuard(reflector as unknown as Reflector, tokenService as never);
  });

  it('allows @Public() routes without any token', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    expect(guard.canActivate(makeContext({}))).toBe(true);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects when no access cookie is present', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    expect(() => guard.canActivate(makeContext({ cookies: {} }))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(makeContext({ cookies: {} }))).toThrow('Authentication required');
  });

  it('rejects an invalid / tampered token with a generic message', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenService.verifyAccessToken.mockImplementation(() => {
      throw new Error('jwt malformed');
    });
    const ctx = makeContext({ cookies: { [ACCESS_COOKIE]: 'bad.jwt' } });
    expect(() => guard.canActivate(ctx)).toThrow('Invalid or expired session');
  });

  it('accepts a valid token and attaches request.user', () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    tokenService.verifyAccessToken.mockReturnValue({
      sub: 'user-9',
      email: 'a@b.com',
      role: 'ADMIN',
    });
    const request: Record<string, unknown> = { cookies: { [ACCESS_COOKIE]: 'good.jwt' } };

    expect(guard.canActivate(makeContext(request))).toBe(true);
    expect(request.user).toEqual({ id: 'user-9', email: 'a@b.com', role: 'ADMIN' });
    expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('good.jwt');
  });
});
