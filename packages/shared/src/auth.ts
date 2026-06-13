import { z } from 'zod';

export const emailSchema = z.string().email().max(255).toLowerCase();

/** Password policy shared by register / reset / change-password. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9]/, 'Must contain a number');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** When a user with 2FA logs in, the API returns a short-lived ticket. */
export const twoFactorChallengeSchema = z.object({
  twoFactorRequired: z.literal(true),
  ticket: z.string(),
});
export type TwoFactorChallenge = z.infer<typeof twoFactorChallengeSchema>;

export const twoFactorVerifySchema = z.object({
  ticket: z.string().min(10),
  /** 6-digit TOTP code or an 8+ char backup code. */
  code: z.string().min(6).max(16),
});
export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;

export const twoFactorEnableSchema = z.object({
  code: z.string().length(6),
});
export type TwoFactorEnableInput = z.infer<typeof twoFactorEnableSchema>;

export const twoFactorSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  qrCodeDataUrl: z.string(),
});
export type TwoFactorSetupResponse = z.infer<typeof twoFactorSetupResponseSchema>;
