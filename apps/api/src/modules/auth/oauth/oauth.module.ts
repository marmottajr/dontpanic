import { Module } from '@nestjs/common';
import { OAuthAdaptersModule } from '../../../infra/oauth/oauth.module';
import { AuthModule } from '../auth.module';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

/**
 * Social sign-in, self-contained: import this one module and the whole feature
 * is wired, or leave it out and nothing about the rest of auth changes.
 *
 * It leans on AuthModule rather than reimplementing anything, because a session
 * born from a Google redirect and a session born from the login form have to be
 * the same object: same rotation family, same cookies, same revocation paths.
 * TokenService and CookieService are the two pieces that guarantee that.
 */
@Module({
  imports: [AuthModule, OAuthAdaptersModule],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
