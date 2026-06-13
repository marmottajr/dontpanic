import type { User } from '@prisma/client';
import type { UserDto } from '@dontpanic/shared';

/**
 * Maps a Prisma User row to the public UserDto. This is the ONLY door the user
 * leaves through, and it deliberately omits passwordHash and twoFactorSecret —
 * those must never reach a client.
 */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
