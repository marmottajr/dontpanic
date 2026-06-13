import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { TwoFactorService } from './services/two-factor.service';
import { CookieService } from './support/cookies';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Auth: register, login, refresh (rotation + reuse detection), logout,
 * forgot/reset password, email verification, TOTP 2FA + backup codes.
 *
 * Exports the building blocks other feature modules compose on:
 * - JwtAuthGuard / RolesGuard — the global gate is registered in AppModule,
 *   but exporting them lets modules reference them in @UseGuards.
 * - TwoFactorService — the users module builds 2FA setup/enable/disable on it.
 * - TokenService / CookieService — for any flow that must mint or clear sessions.
 */
@Module({
  imports: [
    // Secrets are passed per-sign/verify call in TokenService, so the module
    // is registered without a global secret. JWT_ACCESS/REFRESH_SECRET are read
    // from ConfigService where the tokens are actually minted.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    TwoFactorService,
    CookieService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtAuthGuard, RolesGuard, TwoFactorService, TokenService, CookieService],
})
export class AuthModule {}
