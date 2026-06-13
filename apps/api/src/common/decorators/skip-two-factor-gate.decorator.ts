import { SetMetadata } from '@nestjs/common';

export const SKIP_2FA_GATE_KEY = 'skipTwoFactorGate';

/**
 * Lets an authenticated but 2FA-pending user reach this route even when
 * TWO_FACTOR_REQUIRED is on — e.g. the 2FA-setup endpoints, GET /users/me and
 * logout, so they can actually complete (or escape) the forced setup.
 */
export const SkipTwoFactorGate = () => SetMetadata(SKIP_2FA_GATE_KEY, true);
