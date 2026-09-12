import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type {
  Paginated,
  PlatformCreateTenantResponse,
  PlatformStatsDto,
  PlatformTenantDto,
} from '@dontpanic/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { SuperAdminGuard } from './guards/superadmin.guard';
import { PlatformTenantsService } from './services/platform-tenants.service';
import { PlatformStatsService } from './services/platform-stats.service';
import {
  ChangePlanDto,
  ExtendTrialDto,
  PlatformCreateTenantDto,
  PlatformTenantListQueryDto,
  SuspendTenantDto,
} from './dto/platform.dto';
import type { PlatformActor } from './support/platform-scope';

/**
 * The SaaS operator's back-office. Guarded by SuperAdminGuard, which answers
 * 404 rather than 403 — the existence of this panel is not information to give
 * to someone who does not operate it.
 */
@ApiTags('platform')
@Controller('platform')
@UseGuards(SuperAdminGuard)
export class PlatformController {
  constructor(
    private readonly tenants: PlatformTenantsService,
    private readonly stats: PlatformStatsService,
  ) {}

  private actor(user: AuthUser, req: FastifyRequest): PlatformActor {
    return { id: user.id, ip: req.ip, userAgent: req.headers['user-agent'] ?? null };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Customer-base overview' })
  async overview(): Promise<PlatformStatsDto> {
    return this.stats.stats();
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List companies' })
  async list(@Query() query: PlatformTenantListQueryDto): Promise<Paginated<PlatformTenantDto>> {
    return this.tenants.list(query);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'One company in detail' })
  async detail(@Param('id') id: string): Promise<PlatformTenantDto> {
    return this.tenants.get(id);
  }

  /**
   * Creates a company on a customer's behalf. Note what the response does not
   * contain: no password, no user — the first administrator is invited, and
   * `invitationSent` tells the panel whether the mail actually went out.
   */
  @Post('tenants')
  @ApiOperation({ summary: 'Create a company and invite its first administrator' })
  async create(
    @Body() dto: PlatformCreateTenantDto,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<PlatformCreateTenantResponse> {
    return this.tenants.create(dto, this.actor(user, req));
  }

  @Post('tenants/:id/suspend')
  @ApiOperation({ summary: 'Suspend a company' })
  async suspend(
    @Param('id') id: string,
    @Body() dto: SuspendTenantDto,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<PlatformTenantDto> {
    return this.tenants.suspend(id, dto, this.actor(user, req));
  }

  @Post('tenants/:id/reactivate')
  @ApiOperation({ summary: 'Lift a suspension' })
  async reactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<PlatformTenantDto> {
    return this.tenants.reactivate(id, this.actor(user, req));
  }

  @Post('tenants/:id/extend-trial')
  @ApiOperation({ summary: 'Extend a trial' })
  async extendTrial(
    @Param('id') id: string,
    @Body() dto: ExtendTrialDto,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<PlatformTenantDto> {
    return this.tenants.extendTrial(id, dto, this.actor(user, req));
  }

  @Post('tenants/:id/plan')
  @ApiOperation({ summary: 'Move a company to another plan' })
  async changePlan(
    @Param('id') id: string,
    @Body() dto: ChangePlanDto,
    @CurrentUser() user: AuthUser,
    @Req() req: FastifyRequest,
  ): Promise<PlatformTenantDto> {
    return this.tenants.changePlan(id, dto, this.actor(user, req));
  }
}
