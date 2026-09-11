import { SetMetadata } from '@nestjs/common';

export const SENSITIVE_THROTTLE_KEY = 'sensitive-throttle';

/**
 * Marks a route as brute-force sensitive, so the global throttler applies
 * AUTH_RATE_LIMIT_MAX/WINDOW to it instead of the roomy RATE_LIMIT_MAX/WINDOW.
 *
 * Use it on anything unauthenticated that guesses a secret — credentials,
 * e-mail codes, TOTP, reset tokens. The per-account lockout stops one account
 * being hammered; this stops one client spraying many accounts.
 */
export const SensitiveThrottle = () => SetMetadata(SENSITIVE_THROTTLE_KEY, true);
