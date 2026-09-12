import { z } from 'zod';
import { userDtoSchema } from './user';
import { emailSchema, passwordSchema } from './primitives';

/**
 * Captcha token, when CAPTCHA_DRIVER is on. Optional in the contract because
 * the requirement is a deployment setting, not a shape: the API's CaptchaGuard
 * is what enforces it, and it stays silent while the driver is `none`.
 */
export const captchaTokenSchema = z.string().min(1).max(4096).optional();

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().length(6),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const resendVerificationSchema = z.object({
  email: emailSchema,
  captchaToken: captchaTokenSchema,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  captchaToken: captchaTokenSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
  captchaToken: captchaTokenSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
  captchaToken: captchaTokenSchema,
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

/**
 * Why a session ended, as it reaches the browser.
 *
 * It exists so the app can EXPLAIN itself. Without it, someone signed out
 * because another person logged in with the same password sees the ordinary
 * login screen and concludes the system is broken. With it, they see what
 * happened and the advice to change their password if it was not them — which
 * is the only moment that advice is useful.
 *
 * `ROTATED` never reaches a client: it is the ordinary, invisible case.
 */
export const sessionEndReasons = [
  'logout',
  'reuse-detected',
  'signed-in-elsewhere',
  'expired',
] as const;
export const sessionEndReasonSchema = z.enum(sessionEndReasons);
export type SessionEndedReason = (typeof sessionEndReasons)[number];

/**
 * The one extra field a 401 may carry beyond the standard error envelope.
 *
 * Deliberately an allowlist of exactly one key: the error body is a contract
 * with the browser, and spreading whatever an exception happened to hold would
 * turn every internal field into an accidental public API.
 */
export const sessionEndedSchema = z.object({
  sessionEnded: sessionEndReasonSchema,
});
export type SessionEnded = z.infer<typeof sessionEndedSchema>;

/**
 * Cookie carrying a pending two-factor ticket from an OAuth callback to the
 * login screen.
 *
 * It lives in the shared package because both halves read it and a name that
 * matched only by coincidence would fail in the quietest possible way: the API
 * would hand over a ticket the page never looks for, the second factor would
 * never be asked for, and the user would simply sit on a login form that has
 * no idea it is mid-flow.
 *
 * Only social sign-in needs it. After a password, `POST /auth/login` returns
 * the ticket in its response body, because there is a response body to put it
 * in; a redirect has no such channel.
 */
export const TWO_FACTOR_TICKET_COOKIE = 'dp_2fa_ticket';
