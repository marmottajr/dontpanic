import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { InvitationDto, Paginated } from '@dontpanic/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InvitationsService, type InvitationContext } from './invitations.service';
import { CreateInvitationDto, InvitationListQueryDto } from './invitations.dto';

type ReqWithCookies = FastifyRequest & { cookies?: Record<string, string> };

/**
 * Managing a company's invitations. ADMIN only — JwtAuthGuard (global)
 * authenticates, RolesGuard + @Roles('ADMIN') authorise, exactly as on
 * `admin/users`.
 *
 * SUPERADMIN is deliberately not in that list: their requests run in platform
 * scope, so "invite someone" would have no company to invite them into. The
 * platform panel has its own door.
 *
 * No `tenantId` is accepted anywhere below. It comes from the signed `tid`
 * claim by way of the request scope; a body field would let a caller invite
 * themselves into somebody else's company.
 */
@ApiTags('invitations')
@Controller('admin/invitations')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  private ctx(req: FastifyRequest): InvitationContext {
    const cookies = (req as ReqWithCookies).cookies;
    const locale = cookies?.['NEXT_LOCALE'] === 'en-US' ? 'en' : 'pt-BR';
    return { ip: req.ip, userAgent: req.headers['user-agent'] ?? null, locale };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite someone to this company and mail them the link' })
  async create(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateInvitationDto,
    @Req() req: FastifyRequest,
  ): Promise<InvitationDto> {
    return this.invitations.create(admin.id, dto, this.ctx(req));
  }

  @Get()
  @ApiOperation({ summary: 'List invitations (paginated; status is derived, not stored)' })
  async list(@Query() query: InvitationListQueryDto): Promise<Paginated<InvitationDto>> {
    return this.invitations.list(query);
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mail the invitation again with a NEW token (the old one dies)' })
  async resend(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<InvitationDto> {
    return this.invitations.resend(admin.id, id, this.ctx(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  async revoke(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<InvitationDto> {
    return this.invitations.revoke(admin.id, id, this.ctx(req));
  }
}
