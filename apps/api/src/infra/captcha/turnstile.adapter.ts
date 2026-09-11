import type {
  CaptchaProvider,
  CaptchaVerifyContext,
  CaptchaVerifyResult,
} from '../../core/captcha/captcha.provider';
import { siteVerify } from './siteverify';

const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * CAPTCHA_DRIVER=turnstile — Cloudflare Turnstile.
 *
 * Pass/fail only, no score: the challenge itself decides. Tokens are
 * single-use and expire after ~5 minutes, so a retried submit needs a fresh one
 * (the widget resets itself on the client).
 */
export class TurnstileAdapter implements CaptchaProvider {
  readonly enabled = true;

  constructor(
    private readonly secret: string,
    private readonly timeoutMs: number,
  ) {}

  async verify(
    token: string | null | undefined,
    ctx: CaptchaVerifyContext,
  ): Promise<CaptchaVerifyResult> {
    if (!token) return { success: false, errors: ['missing-input-response'] };
    const result = await siteVerify({
      endpoint: ENDPOINT,
      secret: this.secret,
      token,
      ip: ctx.ip,
      timeoutMs: this.timeoutMs,
    });
    return { success: result.success, errors: result.errors };
  }
}
