import type { CaptchaProvider, CaptchaVerifyResult } from '../../core/captcha/captcha.provider';

/** CAPTCHA_DRIVER=none. Approves everything; the guard short-circuits on `enabled`. */
export class NoopCaptchaAdapter implements CaptchaProvider {
  readonly enabled = false;

  async verify(): Promise<CaptchaVerifyResult> {
    return { success: true };
  }
}
