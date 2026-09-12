import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthUserResponse, InvitationPreview } from '@dontpanic/shared';
import { Public } from '../../common/decorators/public.decorator';
import { SensitiveThrottle } from '../../common/decorators/sensitive-throttle.decorator';
import { SystemScope } from '../../infra/tenancy/system-scope.decorator';
import { CookieService } from '../auth/support/cookies';
import { InvitationsService, type InvitationContext } from './invitations.service';
import { AcceptInvitationDto } from './invitations.dto';

type ReqWithCookies = FastifyRequest & { cookies?: Record<string, string> };

/**
 * The unauthenticated half of invitations: what the person holding the link
 * uses. Both routes carry three decorators, and each earns its place.
 *
 * `@SystemScope()` — for exactly the reason login has it: the tenant is a
 * *result* of resolving the token, not something available beforehand. Without
 * it, RLS returns nothing and every invitation looks invalid. It is an
 * exception to tenant isolation and should be read as one: nothing here trusts
 * a client-supplied company, and the token decides which rows are touched.
 *
 * `@SensitiveThrottle()` — this is a route that guesses a secret. The tight
 * AUTH_RATE_LIMIT budget is what stops someone walking the token space, and it
 * is the only thing that does: there is no account here to lock out.
 *
 * No `@RequireCaptcha`. The token is 256 bits: guessing one is not a thing a
 * bot farm shortens, so a captcha would buy nothing and would cost every
 * invited person a puzzle on their first contact with the product. The
 * throttle covers what is actually at risk.
 */
@ApiTags('invitations')
@Controller('auth/invitations')
export class PublicInvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly cookies: CookieService,
  ) {}

  private ctx(req: FastifyRequest): InvitationContext {
    const cookies = (req as ReqWithCookies).cookies;
    const locale = cookies?.['NEXT_LOCALE'] === 'en-US' ? 'en' : 'pt-BR';
    return { ip: req.ip, userAgent: req.headers['user-agent'] ?? null, locale };
  }

  @Public()
  @SystemScope()
  @Get(':token')
  @SensitiveThrottle()
  @ApiOperation({ summary: 'What this invitation is for, before accepting it' })
  async preview(@Param('token') token: string): Promise<InvitationPreview> {
    return this.invitations.preview(token);
  }

  @Public()
  @SystemScope()
  @Post('accept')
  @SensitiveThrottle()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create the account behind an invitation and sign it in' })
  async accept(
    @Body() dto: AcceptInvitationDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthUserResponse> {
    const { user, tokens } = await this.invitations.accept(dto, this.ctx(req));
    // Same cookies the login route sets, from the same service — an invited
    // user lands inside the app, not on a login form asking for the password
    // they just chose.
    this.cookies.setAccessCookie(reply, tokens.accessToken);
    this.cookies.setRefreshCookie(reply, tokens.refreshToken);
    return { user };
  }
}
