import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { CompleteOAuthSignupResponse, OAuthProvidersResponse } from '@dontpanic/shared';
import { Public } from '../../../common/decorators/public.decorator';
import { SensitiveThrottle } from '../../../common/decorators/sensitive-throttle.decorator';
import { SystemScope } from '../../../infra/tenancy/system-scope.decorator';
import type { RequestContext } from '../services/auth.service';
import { OAUTH_STATE_COOKIE, type OAuthIntent } from './oauth-state';
import { CompleteOAuthSignupDto } from './oauth.dto';
import { OAuthService, type OAuthCallbackParams } from './oauth.service';

type ReqWithCookies = FastifyRequest & { cookies?: Record<string, string> };

/**
 * Read whatever the provider sent, without trusting its shape.
 *
 * These values come off a redirect, so anything can be in there — repeated
 * parameters make Fastify hand back an array, and a hostile caller can put an
 * object in the form body. Non-strings are dropped rather than coerced; every
 * one of them ends the flow at the state check anyway.
 */
function callbackParams(source: unknown): OAuthCallbackParams {
  const raw = (source ?? {}) as Record<string, unknown>;
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value !== '' ? value : undefined;
  return {
    code: str(raw.code),
    state: str(raw.state),
    error: str(raw.error),
    user: str(raw.user),
  };
}

@ApiTags('auth')
@Controller('auth/oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  private ctx(req: FastifyRequest): RequestContext {
    const cookies = (req as ReqWithCookies).cookies;
    const locale = cookies?.['NEXT_LOCALE'] === 'en-US' ? 'en' : 'pt-BR';
    return { ip: req.ip, userAgent: req.headers['user-agent'] ?? null, locale };
  }

  /**
   * Which buttons the login screen should render.
   *
   * No `@SystemScope()`: it answers from configuration and never touches the
   * database, so there is nothing for a scope to isolate. The decorator is an
   * exception to tenant isolation and adding one that is not needed is how the
   * list of exceptions stops meaning anything.
   */
  @Public()
  @Get('providers')
  @ApiOperation({ summary: 'List the configured social sign-in providers' })
  providers(): OAuthProvidersResponse {
    return this.oauth.listProviders();
  }

  /**
   * Send the browser to the provider. 404 when it is not configured — whether
   * an operator holds a Google client id is not a stranger's business.
   */
  @Public()
  @Get(':provider/start')
  @SensitiveThrottle()
  @ApiOperation({ summary: 'Begin a social sign-in (302 to the provider)' })
  start(
    @Param('provider') provider: string,
    @Query('intent') intent: string | undefined,
    @Res() reply: FastifyReply,
  ): void {
    const wanted: OAuthIntent = intent === 'signup' ? 'signup' : 'login';
    void reply.redirect(this.oauth.start(provider, wanted, reply), HttpStatus.FOUND);
  }

  /** Google and GitHub come back here, on a GET with a query string. */
  @Public()
  @Get(':provider/callback')
  @SensitiveThrottle()
  @ApiOperation({ summary: 'Provider callback (302 back into the web app)' })
  async callback(
    @Param('provider') provider: string,
    @Req() req: ReqWithCookies,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.finish(provider, callbackParams(req.query), req, reply);
  }

  /**
   * Apple comes back here instead.
   *
   * Asking Apple for the user's name or e-mail forces `response_mode=form_post`,
   * so the same logical callback arrives as a cross-site POST with a
   * form-encoded body. Both verbs exist for one route because the difference is
   * Apple's, not ours.
   */
  @Public()
  @Post(':provider/callback')
  @SensitiveThrottle()
  @ApiExcludeEndpoint()
  async callbackFormPost(
    @Param('provider') provider: string,
    @Req() req: ReqWithCookies,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.finish(provider, callbackParams(req.body), req, reply);
  }

  private async finish(
    provider: string,
    params: OAuthCallbackParams,
    req: ReqWithCookies,
    reply: FastifyReply,
  ): Promise<void> {
    const target = await this.oauth.handleCallback(
      provider,
      params,
      req.cookies?.[OAUTH_STATE_COOKIE],
      this.ctx(req),
      reply,
    );
    void reply.redirect(target, HttpStatus.FOUND);
  }

  /**
   * Turn a parked identity into a company.
   *
   * `@SystemScope()` for the same reason public signup carries it: there is no
   * tenant to derive a scope from until this request creates one.
   */
  @Public()
  @SystemScope()
  @Post('complete-signup')
  @SensitiveThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finish a social registration by creating the company' })
  async completeSignup(
    @Body() dto: CompleteOAuthSignupDto,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<CompleteOAuthSignupResponse> {
    return this.oauth.completeSignup(dto, this.ctx(req), reply);
  }
}
