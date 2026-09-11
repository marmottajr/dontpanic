import { SetMetadata } from '@nestjs/common';

export const REQUIRE_CAPTCHA_KEY = 'require-captcha';

/**
 * Demands a solved captcha before the handler runs — a no-op while
 * CAPTCHA_DRIVER=none, so the same code works with and without keys.
 *
 * `action` is echoed to reCAPTCHA v3, which refuses a token minted for a
 * different action; keep it equal to the route's purpose ('login', 'register').
 * Other drivers ignore it.
 */
export const RequireCaptcha = (action: string) => SetMetadata(REQUIRE_CAPTCHA_KEY, action);
