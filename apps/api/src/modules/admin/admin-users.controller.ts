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
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminUser, AdminUserList, MessageResponse } from '@dontpanic/shared';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminUsersService } from './admin-users.service';
import { PaginationQueryDto, UpdateRoleDto } from './admin.dto';

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
  ): Promise<AdminUser> {
    return this.adminUsers.setRole(admin.id, id, dto.role);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lock a user out and revoke their sessions' })
  async lock(@Param('id') id: string): Promise<AdminUser> {
    return this.adminUsers.setLocked(id, true);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift a user lock' })
  async unlock(@Param('id') id: string): Promise<AdminUser> {
    return this.adminUsers.setLocked(id, false);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a user and revoke their sessions' })
  async remove(@CurrentUser() admin: AuthUser, @Param('id') id: string): Promise<MessageResponse> {
    await this.adminUsers.softDelete(admin.id, id);
    return { message: 'User deleted.' };
  }
}
