import type { User } from '@prisma/client';

/** Build a fully-shaped Prisma User row for unit tests (override as needed). */
export function makeUser(overrides: Partial<User> = {}): User {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    id: 'user-1',
    email: 'arthur@dent.dev',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$secrethash',
    name: 'Arthur Dent',
    avatarUrl: null,
    role: 'USER',
    emailVerified: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    // The seat on the company's plan. Non-nullable in the schema, so a real row
    // always carries it — and the auth paths now refuse a falsy one, which an
    // incomplete fixture would trip over for the wrong reason.
    active: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  } as User;
}
