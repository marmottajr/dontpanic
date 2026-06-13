import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  AuthUserResponse,
  CsrfTokenResponse,
  LoginResponse,
  MessageResponse,
  UserDto,
} from '@dontpanic/shared';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService, type RequestContext } from './services/auth.service';
import { CookieService, REFRESH_COOKIE } from './support/cookies';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  TwoFactorVerifyDto,
} from './dto/auth.dto';

type ReqWithCookies = FastifyRequest & { cookies?: Record<string, string> };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: CookieService,
  ) {}

  private ctx(req: FastifyRequest): RequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] ?? null };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create an account and send an email-verification link' })
  async register(@Body() dto: RegisterDto, @Req() req: FastifyRequest): Promise<UserDto> {
    return this.auth.register(dto, this.ctx(req));
  }

  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Confirm an email address via the verification token' })
  async verifyEmail(@Query('token') token: string): Promise<MessageResponse> {
    return this.auth.verifyEmail(token ?? '');
  }

  @Public()
  @Post('login')
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
  @Post('2fa/verify')
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
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and reissue auth cookies' })
  async refresh(
    @Req() req: ReqWithCookies,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthUserResponse> {
    const raw = req.cookies?.[REFRESH_COOKIE] ?? '';
    const { user, tokens } = await this.auth.refresh(raw, this.ctx(req));
    this.cookies.setAccessCookie(reply, tokens.accessToken);
    this.cookies.setRefreshCookie(reply, tokens.refreshToken);
    return { user };
  }

  @Post('logout')
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
  @Post('forgot-password')
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
  @Post('reset-password')
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
