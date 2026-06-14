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
import { AdminCreateUserDto, PaginationQueryDto, UpdateRoleDto } from './admin.dto';

/**
 * Admin user administration. Every route requires the ADMIN role — JwtAuthGuard
 * (global) authenticates, then RolesGuard + @Roles('ADMIN') authorise.
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a user (created already email-verified)' })
  async create(
    @CurrentUser() admin: AuthUser,
    @Body() dto: AdminCreateUserDto,
    @Req() req: FastifyRequest,
  ): Promise<AdminUser> {
    return this.adminUsers.create(admin.id, dto, this.ctx(req));
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
