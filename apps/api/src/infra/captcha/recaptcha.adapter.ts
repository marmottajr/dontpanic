import type {
  CaptchaProvider,
  CaptchaVerifyContext,
  CaptchaVerifyResult,
} from '../../core/captcha/captcha.provider';
import { siteVerify } from './siteverify';

const ENDPOINT = 'https://www.google.com/recaptcha/api/siteverify';

export interface RecaptchaOptions {
  secret: string;
  timeoutMs: number;
  /** v3 grades silently and returns a score; v2 shows a checkbox and just passes/fails. */
  version: 'v2' | 'v3';
  /** v3 only: reject below this. Google's own default is 0.5. */
  minScore: number;
}

/**
 * CAPTCHA_DRIVER=recaptcha-v2 | recaptcha-v3 — Google reCAPTCHA.
 *
 * On v3 a valid token is not enough: the score must clear the threshold AND the
 * action must match the one the page claimed, otherwise a token minted on a
 * cheap public page could be replayed against login.
 */
export class RecaptchaAdapter implements CaptchaProvider {
  readonly enabled = true;

  constructor(private readonly options: RecaptchaOptions) {}

  async verify(
    token: string | null | undefined,
    ctx: CaptchaVerifyContext,
  ): Promise<CaptchaVerifyResult> {
    if (!token) return { success: false, errors: ['missing-input-response'] };

    const result = await siteVerify({
      endpoint: ENDPOINT,
      secret: this.options.secret,
      token,
      ip: ctx.ip,
      timeoutMs: this.options.timeoutMs,
    });

    if (!result.success) return { success: false, score: result.score, errors: result.errors };
    if (this.options.version === 'v2') return { success: true };

    if (ctx.action && result.action && result.action !== ctx.action) {
      return { success: false, score: result.score, errors: ['action-mismatch'] };
    }
    const score = result.score ?? 0;
    if (score < this.options.minScore) {
      return { success: false, score, errors: ['low-score'] };
    }
    return { success: true, score };
  }
}
