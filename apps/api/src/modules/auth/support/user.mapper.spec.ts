import { makeUser } from '../../../../test/factories';
import { toUserDto } from './user.mapper';

describe('toUserDto', () => {
  it('maps the public fields and serialises dates to ISO strings', () => {
    const user = makeUser({
      id: 'abc',
      email: 'ford@prefect.dev',
      name: 'Ford Prefect',
      avatarUrl: 'http://cdn/avatar.webp',
      role: 'ADMIN',
      emailVerified: true,
      twoFactorEnabled: true,
    });

    const dto = toUserDto(user);

    expect(dto).toEqual({
      id: 'abc',
      email: 'ford@prefect.dev',
      name: 'Ford Prefect',
      avatarUrl: 'http://cdn/avatar.webp',
      role: 'ADMIN',
      emailVerified: true,
      twoFactorEnabled: true,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  });

  it('NEVER leaks the password hash or the 2FA secret', () => {
    const user = makeUser({
      passwordHash: 'SUPER-SECRET-HASH',
      twoFactorSecret: 'TOTPSECRET',
      twoFactorEnabled: true,
    });

    const dto = toUserDto(user) as Record<string, unknown>;

    expect(dto).not.toHaveProperty('passwordHash');
    expect(dto).not.toHaveProperty('twoFactorSecret');
    expect(JSON.stringify(dto)).not.toContain('SUPER-SECRET-HASH');
    expect(JSON.stringify(dto)).not.toContain('TOTPSECRET');
  });

  it('does not leak internal lockout / soft-delete columns', () => {
    const dto = toUserDto(
      makeUser({ failedLoginAttempts: 3, lockedUntil: new Date(), deletedAt: new Date() }),
    ) as Record<string, unknown>;
    expect(dto).not.toHaveProperty('failedLoginAttempts');
    expect(dto).not.toHaveProperty('lockedUntil');
    expect(dto).not.toHaveProperty('deletedAt');
  });

  it('preserves a null avatarUrl', () => {
    expect(toUserDto(makeUser({ avatarUrl: null })).avatarUrl).toBeNull();
  });
});
