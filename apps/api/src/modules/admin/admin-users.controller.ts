import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { AdminUser, AdminUserList, MessageResponse } from '@dontpanic/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminUsersService, type AdminContext } from './admin-users.service';
import { PaginationQueryDto, UpdateRoleDto } from './admin.dto';

/**
 * Admin user administration. Every route requires the ADMIN role — JwtAuthGuard
 * (global) authenticates, then RolesGuard + @Roles('ADMIN') authorise.
 *
 * There is no POST here: a new colleague arrives through
 * `POST /admin/invitations`, never through an admin choosing their password.
 */
@ApiTags('admin')
@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  private ctx(req: FastifyRequest): AdminContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] ?? null };
  }

  @Get()
  @ApiOperation({ summary: 'List users (paginated, searchable by email/name)' })
  async list(@Query() query: PaginationQueryDto): Promise<AdminUserList> {
    return this.adminUsers.list(query);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: "Change a user's role" })
  async setRole(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: FastifyRequest,
  ): Promise<AdminUser> {
    return this.adminUsers.setRole(admin.id, id, dto.role, this.ctx(req));
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock a user out and revoke their sessions' })
  async lock(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<AdminUser> {
    return this.adminUsers.setLocked(admin.id, id, true, this.ctx(req));
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift a user lock' })
  async unlock(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<AdminUser> {
    return this.adminUsers.setLocked(admin.id, id, false, this.ctx(req));
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Free the seat: switch a user off and revoke their sessions' })
  async deactivate(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<AdminUser> {
    return this.adminUsers.setActive(admin.id, id, false, this.ctx(req));
  }

  // Separate from `unlock` on purpose: locking is a security state the
  // brute-force lockout also writes, while `active` is the seat on the plan.
  // Reactivating can therefore be REFUSED when the plan is full, which is a
  // thing unlocking must never do.
  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take a seat back: switch a user on if the plan has room' })
  async activate(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<AdminUser> {
    return this.adminUsers.setActive(admin.id, id, true, this.ctx(req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a user and revoke their sessions' })
  async remove(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ): Promise<MessageResponse> {
    await this.adminUsers.softDelete(admin.id, id, this.ctx(req));
    return { message: 'User deleted.' };
  }
}
