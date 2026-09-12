import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ProfileOption } from '@dontpanic/shared';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrismaService } from '../../infra/prisma/prisma.service';

/**
 * The company's permission profiles, as a picker needs them.
 *
 * It exists because inviting someone means choosing what they will be able to
 * do, and until now the only way to express that choice was to know a profile's
 * UUID. A dialog that cannot offer the list either sends null — everyone lands
 * on the default and an administrator has to go and fix each one afterwards —
 * or asks a human to paste an identifier.
 *
 * Read-only and ADMIN-gated. Creating and editing profiles is a larger surface
 * (it is where the permission matrix is decided) and does not belong in a
 * route that exists to fill a dropdown.
 */
@ApiTags('admin')
@Controller('admin/profiles')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminProfilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "List the company's permission profiles" })
  async list(): Promise<ProfileOption[]> {
    // `prisma.db` carries the request's tenant scope, so this cannot return
    // another company's profiles even if the query forgot to say so — and it
    // does not say so, on purpose: the isolation is Postgres's job here.
    //
    // Not paginated. A company has a handful of profiles, and the caller is a
    // dropdown that has to show all of them or none.
    const profiles = await this.prisma.db.profile.findMany({
      orderBy: [{ system: 'desc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, system: true },
    });
    return profiles;
  }
}
