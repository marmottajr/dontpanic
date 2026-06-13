import { Module } from '@nestjs/common';

/**
 * Auth: register, login, refresh (rotation + reuse detection), logout,
 * forgot/reset password, e-mail verification, TOTP 2FA + backup codes.
 * Implementation lands here in the auth phase.
 */
@Module({})
export class AuthModule {}
