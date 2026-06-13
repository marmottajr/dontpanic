import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './services/users.service';

/**
 * Users/profile: me, update name, change password, 2FA management (setup/
 * enable/disable) and the LGPD data rights (access export + erasure).
 *
 * Imports AuthModule to reuse its exported TwoFactorService (TOTP + backup
 * codes) and TokenService (session revocation). Routes are gated by the global
 * JwtAuthGuard registered in AppModule; the caller is read via @CurrentUser.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
