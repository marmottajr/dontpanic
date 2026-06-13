import { z } from 'zod';
import { userDtoSchema } from './user';
import { emailSchema, passwordSchema } from './primitives';

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().length(6),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

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

/**
 * Disabling 2FA must re-prove identity: either a live TOTP code OR the account
 * password. Exactly one is required — supplying neither is a validation error.
 */
export const twoFactorDisableSchema = z
  .object({
    code: z.string().length(6).optional(),
    password: z.string().min(1).max(128).optional(),
  })
  .refine((v) => Boolean(v.code) || Boolean(v.password), {
    message: 'Provide either a TOTP code or your password',
  });
export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>;

export const twoFactorSetupResponseSchema = z.object({
  secret: z.string(),
  otpauthUrl: z.string(),
  qrCodeDataUrl: z.string(),
});
export type TwoFactorSetupResponse = z.infer<typeof twoFactorSetupResponseSchema>;

/** Backup codes are shown exactly once — when 2FA is first enabled. */
export const twoFactorEnableResponseSchema = z.object({
  backupCodes: z.array(z.string()),
});
export type TwoFactorEnableResponse = z.infer<typeof twoFactorEnableResponseSchema>;

/** Successful authentication: the public user is returned; tokens ride in httpOnly cookies. */
export const authUserResponseSchema = z.object({
  user: userDtoSchema,
});
export type AuthUserResponse = z.infer<typeof authUserResponseSchema>;

/**
 * Login can either succeed (returns the user) or demand a second factor
 * (returns a short-lived ticket). The web app discriminates on `twoFactorRequired`.
 */
export const loginResponseSchema = z.union([authUserResponseSchema, twoFactorChallengeSchema]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** CSRF bootstrap: the SPA reads this token and echoes it back in `x-csrf-token`. */
export const csrfTokenResponseSchema = z.object({
  csrfToken: z.string(),
});
export type CsrfTokenResponse = z.infer<typeof csrfTokenResponseSchema>;
