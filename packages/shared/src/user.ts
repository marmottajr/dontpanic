import { z } from 'zod';
import { passwordSchema } from './primitives';

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

/** Drives the 2FA onboarding: forced setup (required) or a snoozable prompt. */
export const securityStatusSchema = z.object({
  twoFactorEnabled: z.boolean(),
  twoFactorRequired: z.boolean(),
  shouldPrompt: z.boolean(),
});
export type SecurityStatus = z.infer<typeof securityStatusSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Step 1 of changing the account email: prove the password, name the new email. */
export const emailChangeRequestSchema = z.object({
  newEmail: z.string().email(),
  password: z.string().min(1).max(128),
});
export type EmailChangeRequestInput = z.infer<typeof emailChangeRequestSchema>;

/** Step 2: confirm the 6-digit code sent to the new address. */
export const emailChangeVerifySchema = z.object({
  code: z.string().min(4).max(8),
});
export type EmailChangeVerifyInput = z.infer<typeof emailChangeVerifySchema>;

/** Returned after an avatar is uploaded or deleted (null when removed). */
export const avatarResponseSchema = z.object({
  avatarUrl: z.string().url().nullable(),
});
export type AvatarResponse = z.infer<typeof avatarResponseSchema>;

/** One active session — a refresh-token rotation family — for the sessions UI. */
export const sessionDtoSchema = z.object({
  id: z.string(), // the rotation familyId
  current: z.boolean(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;

export const sessionListSchema = z.array(sessionDtoSchema);
export type SessionList = z.infer<typeof sessionListSchema>;

/** A single audit-log entry as exposed to the data subject (LGPD export). */
export const auditLogEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

/**
 * LGPD right of access: everything the system holds about the data subject,
 * bundled as portable JSON. Secrets (password hash, 2FA secret, backup codes,
 * raw tokens) are deliberately excluded.
 */
export const userDataExportSchema = z.object({
  profile: userDtoSchema,
  auditLogs: z.array(auditLogEntrySchema),
  exportedAt: z.string(),
});
export type UserDataExport = z.infer<typeof userDataExportSchema>;
