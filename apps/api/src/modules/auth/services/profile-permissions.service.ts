import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { PermissionAction, PermissionModule } from '@dontpanic/shared';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../infra/prisma/prisma.service';

/** What the request in flight may do, already resolved from its profile. */
export interface ResolvedPermissions {
  /** Profile code (`ADMIN`, `MEMBER`, …), or null when there is no profile. */
  profileCode: string | null;
  /** Granted `module:action` pairs. */
  granted: ReadonlySet<string>;
  /** Company ADMIN: passes everything without consulting the table. */
  unrestricted: boolean;
  /** Platform operator — has no company, so no permissions inside one. */
  platformOperator: boolean;
}

/** Our own key on the request; the `_` marks it as not part of the HTTP contract. */
const CACHE_KEY = '_resolvedPermissions';

type RequestWithPermissions = FastifyRequest & {
  user?: AuthUser;
  [CACHE_KEY]?: ResolvedPermissions;
};

const NO_PERMISSIONS: ReadonlySet<string> = new Set<string>();

const EMPTY: ResolvedPermissions = {
  profileCode: null,
  granted: NO_PERMISSIONS,
  unrestricted: false,
  platformOperator: false,
};

/**
 * Resolves the request user's profile and the permissions it carries.
 *
 * The read happens **once per request** and is stored on the request object:
 * the permission guard needs it before the controller and any response
 * interceptor may need it after, and going to the database twice for the same
 * row makes no sense.
 *
 * The query runs in the tenant's own scope (`forTenant`), so Postgres confirms
 * through RLS that the profile really belongs to the JWT's company — a
 * `profileId` from another company would return no row.
 */
@Injectable()
export class ProfilePermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** What this request already resolved, without touching the database. */
  peek(request: FastifyRequest): ResolvedPermissions | undefined {
    return (request as RequestWithPermissions)[CACHE_KEY];
  }

  async resolve(request: FastifyRequest): Promise<ResolvedPermissions> {
    const req = request as RequestWithPermissions;
    const cached = req[CACHE_KEY];
    if (cached) return cached;

    const resolved = await this.load(req.user);
    req[CACHE_KEY] = resolved;
    return resolved;
  }

  private async load(user: AuthUser | undefined): Promise<ResolvedPermissions> {
    if (!user) return EMPTY;
    if (user.role === 'SUPERADMIN') return { ...EMPTY, platformOperator: true };

    // The company ADMIN is by definition the one in charge of it: always
    // passes, even if the profile attached to the user is incomplete.
    if (user.role === 'ADMIN') {
      return { ...EMPTY, profileCode: 'ADMIN', unrestricted: true };
    }

    if (!user.tenantId) return EMPTY;

    const row = await this.prisma.forTenant(user.tenantId, (tx) =>
      tx.user.findUnique({
        where: { id: user.id },
        select: {
          profile: {
            select: { code: true, permissions: { select: { module: true, action: true } } },
          },
        },
      }),
    );

    const profile = row?.profile ?? null;
    // No profile means no permissions: fail closed, never "everything by default".
    if (!profile) return EMPTY;

    return {
      profileCode: profile.code,
      granted: new Set(profile.permissions.map((p) => `${p.module}:${p.action}`)),
      unrestricted: false,
      platformOperator: false,
    };
  }
}

/** Tests one concrete permission against what the request resolved. */
export function permits(
  permissions: ResolvedPermissions,
  module: PermissionModule,
  action: PermissionAction,
): boolean {
  if (permissions.unrestricted) return true;
  return permissions.granted.has(`${module}:${action}`);
}
