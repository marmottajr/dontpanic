import { z } from 'zod';
import { passwordSchema } from './auth';

export const RoleEnum = z.enum(['ADMIN', 'USER']);
export type Role = z.infer<typeof RoleEnum>;

/** Public user shape returned to clients — never includes secrets. */
export const userDtoSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  role: RoleEnum,
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserDto = z.infer<typeof userDtoSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
