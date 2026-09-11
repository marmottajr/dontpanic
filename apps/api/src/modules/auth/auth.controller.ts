import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  SignupResponse,
  AuthUserResponse,
  CsrfTokenResponse,
  LoginResponse,
  MessageResponse,
} from '@dontpanic/shared';
import { Public } from '../../common/decorators/public.decorator';
import { SkipTwoFactorGate } from '../../common/decorators/skip-two-factor-gate.decorator';
import { SensitiveThrottle } from '../../common/decorators/sensitive-throttle.decorator';
import { RequireCaptcha } from '../../common/decorators/require-captcha.decorator';
import { SystemScope } from '../../infra/tenancy/system-scope.decorator';
import { AuthService, type RequestContext } from './services/auth.service';
import { SignupService } from './services/signup.service';
import { CookieService, REFRESH_COOKIE } from './support/cookies';
import {
  ForgotPasswordDto,
  LoginDto,
  ResendVerificationDto,
  ResetPasswordDto,
  SignupDto,
  TwoFactorVerifyDto,
  VerifyEmailDto,
} from './dto/auth.dto';

type ReqWithCookies = FastifyRequest & { cookies?: Record<string, string> };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly signupService: SignupService,
    private readonly cookies: CookieService,
  ) {}

  private ctx(req: FastifyRequest): RequestContext {
    const cookies = (req as ReqWithCookies).cookies;
    const locale = cookies?.['NEXT_LOCALE'] === 'en-US' ? 'en' : 'pt-BR';
    return { ip: req.ip, userAgent: req.headers['user-agent'] ?? null, locale };
  }

  /**
   * Self-serve company registration: the entry point for a new customer.
   *
   * `@SystemScope()` because there is no tenant yet to derive a scope from —
   * it is one of the few legitimate exceptions to tenant isolation, and every
   * route carrying it deserves a second look in review.
   */
  @Public()
  @SystemScope()
  @Post('signup')
  @SensitiveThrottle()
  @RequireCaptcha('signup')
  @ApiOperation({ summary: 'Register a company and its first administrator' })
  async signup(@Body() dto: SignupDto, @Req() req: FastifyRequest): Promise<SignupResponse> {
    return this.signupService.signup(dto, this.ctx(req));
  }

  @Public()
  @SystemScope()
  @Post('verify-email')
  @SensitiveThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an email address with the 6-digit code' })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.auth.verifyEmail(dto.email, dto.code, this.ctx(req));
  }

  @Public()
  @SystemScope()
  @Post('resend-verification')
  @SensitiveThrottle()
  @RequireCaptcha('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the email-verification code' })
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.auth.resendVerification(dto.email, this.ctx(req));
  }

  @Public()
  @SystemScope()
  @Post('login')
  @SensitiveThrottle()
  @RequireCaptcha('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate; sets auth cookies or returns a 2FA challenge' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(dto, this.ctx(req));
    if (result.kind === 'challenge') {
      return result.challenge;
    }
    this.cookies.setAccessCookie(reply, result.tokens.accessToken);
    this.cookies.setRefreshCookie(reply, result.tokens.refreshToken);
    return { user: result.user };
  }

  @Public()
  @SystemScope()
  @Post('2fa/verify')
  @SensitiveThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete login by verifying a TOTP or backup code' })
  async verifyTwoFactor(
    @Body() dto: TwoFactorVerifyDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthUserResponse> {
    const { user, tokens } = await this.auth.verifyTwoFactor(dto.ticket, dto.code, this.ctx(req));
    this.cookies.setAccessCookie(reply, tokens.accessToken);
    this.cookies.setRefreshCookie(reply, tokens.refreshToken);
    return { user };
  }

  @Public()
  @SystemScope()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and reissue auth cookies' })
  async refresh(
    @Req() req: ReqWithCookies,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthUserResponse> {
    const raw = req.cookies?.[REFRESH_COOKIE] ?? '';

    let user: AuthUserResponse['user'];
    let tokens: { accessToken: string; refreshToken: string };
    try {
      ({ user, tokens } = await this.auth.refresh(raw, this.ctx(req)));
    } catch (err) {
      // A refused refresh means the session is over for good. Clearing the
      // cookies here is what stops the Next proxy from still seeing a "session"
      // in the access cookie and bouncing the user from /login back inside, in
      // a loop — the access cookie now outlives the JWT it carries.
      this.cookies.clearAuthCookies(reply);
      throw err;
    }

    this.cookies.setAccessCookie(reply, tokens.accessToken);
    this.cookies.setRefreshCookie(reply, tokens.refreshToken);
    return { user };
  }

  @Post('logout')
  @SkipTwoFactorGate()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current refresh token and clear cookies' })
  async logout(
    @Req() req: ReqWithCookies,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponse> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], this.ctx(req));
    this.cookies.clearAuthCookies(reply);
    return { message: "Logged out. Don't Panic — your session is gone." };
  }

  @Public()
  @SystemScope()
  @Post('forgot-password')
  @SensitiveThrottle()
  @RequireCaptcha('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password-reset email (always returns 200)' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    await this.auth.forgotPassword(dto, this.ctx(req));
    return {
      message: 'If an account exists for that email, a reset link is on its way.',
    };
  }

  @Public()
  @SystemScope()
  @Post('reset-password')
  @SensitiveThrottle()
  @RequireCaptcha('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    return this.auth.resetPassword(dto, this.ctx(req));
  }

  @Public()
  @Get('csrf')
  @ApiOperation({ summary: 'Issue a CSRF token for the SPA to echo in x-csrf-token' })
  csrf(@Res({ passthrough: true }) reply: FastifyReply): CsrfTokenResponse {
    const csrfToken = reply.generateCsrf();
    return { csrfToken };
  }
}
