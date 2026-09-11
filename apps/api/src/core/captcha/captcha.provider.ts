export const CAPTCHA_PROVIDER = Symbol('CAPTCHA_PROVIDER');

export interface CaptchaVerifyContext {
  /** Client IP, forwarded to the provider so it can weigh reputation. */
  ip?: string | null;
  /** Logical action name ('login', 'forgot-password'), checked by reCAPTCHA v3. */
  action?: string;
}

export interface CaptchaVerifyResult {
  success: boolean;
  /** reCAPTCHA v3 only: 0.0 (bot) .. 1.0 (human). */
  score?: number;
  /** Provider error codes, for logging. Never surfaced to the client. */
  errors?: string[];
}

/**
 * Port for human verification on unauthenticated forms.
 *
 * Adapters: Cloudflare Turnstile, Google reCAPTCHA (v2 checkbox and v3 score),
 * and a no-op for when it is switched off. Picked by CAPTCHA_DRIVER.
 */
export interface CaptchaProvider {
  /** False for the no-op adapter — the guard then skips verification entirely. */
  readonly enabled: boolean;
  verify(token: string | null | undefined, ctx: CaptchaVerifyContext): Promise<CaptchaVerifyResult>;
}
