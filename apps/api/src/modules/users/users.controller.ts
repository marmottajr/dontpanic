import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type {
  MessageResponse,
  SecurityStatus,
  TwoFactorEnableResponse,
  TwoFactorSetupResponse,
  UserDataExport,
  UserDto,
} from '@dontpanic/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { SkipTwoFactorGate } from '../../common/decorators/skip-two-factor-gate.decorator';
import { UsersService, type RequestContext } from './services/users.service';
import {
  ChangePasswordDto,
  TwoFactorDisableDto,
  TwoFactorEnableDto,
  UpdateProfileDto,
} from './dto/users.dto';

/**
 * Self-service profile, credentials, 2FA management and LGPD data rights.
 * Every route here is protected by the global JwtAuthGuard — there is no
 * @Public() escape hatch — and always operates on the *caller's* own record
 * (@CurrentUser), never an arbitrary id, so there's no IDOR surface.
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  private ctx(req: FastifyRequest): RequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] ?? null };
  }

  @Get('me')
  @SkipTwoFactorGate()
  @ApiOperation({ summary: "Get the current user's profile" })
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return this.users.getProfile(user.id);
  }

  @Get('me/security')
  @SkipTwoFactorGate()
  @ApiOperation({ summary: '2FA onboarding status (enabled / required / should-prompt)' })
  async security(@CurrentUser() user: AuthUser): Promise<SecurityStatus> {
    return this.users.getSecurityStatus(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: "Update the current user's profile (name)" })
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<UserDto> {
    return this.users.updateProfile(user.id, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password (revokes all sessions)' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    await this.users.changePassword(user.id, dto, this.ctx(req));
    return { message: "Password changed. Don't Panic — log back in everywhere." };
  }

  @Post('me/2fa/setup')
  @SkipTwoFactorGate()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin 2FA setup: returns a secret, otpauth URI and QR code' })
  async setupTwoFactor(@CurrentUser() user: AuthUser): Promise<TwoFactorSetupResponse> {
    return this.users.setupTwoFactor(user.id);
  }

  @Post('me/2fa/enable')
  @SkipTwoFactorGate()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable 2FA by verifying a code; returns one-time backup codes' })
  async enableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body() dto: TwoFactorEnableDto,
    @Req() req: FastifyRequest,
  ): Promise<TwoFactorEnableResponse> {
    const backupCodes = await this.users.enableTwoFactor(user.id, dto, this.ctx(req));
    return { backupCodes };
  }

  @Post('me/2fa/snooze')
  @SkipTwoFactorGate()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss the 2FA prompt for 24h (optional mode)' })
  async snoozeTwoFactor(@CurrentUser() user: AuthUser): Promise<MessageResponse> {
    await this.users.snoozeTwoFactorPrompt(user.id);
    return { message: "We'll remind you about 2FA tomorrow. Don't Panic." };
  }

  @Post('me/2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA (verify a TOTP code or your password)' })
  async disableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body() dto: TwoFactorDisableDto,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    await this.users.disableTwoFactor(user.id, dto, this.ctx(req));
    return { message: 'Two-factor authentication disabled.' };
  }

  @Get('me/export')
  @ApiOperation({ summary: 'LGPD data access: export all of your data as JSON' })
  async exportData(@CurrentUser() user: AuthUser): Promise<UserDataExport> {
    return this.users.exportData(user.id);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'LGPD erasure: soft-delete and anonymize your account' })
  async eraseAccount(
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    await this.users.eraseAccount(user.id, this.ctx(req));
    return { message: 'Your account has been deleted. So long, and thanks for all the fish.' };
  }
}
