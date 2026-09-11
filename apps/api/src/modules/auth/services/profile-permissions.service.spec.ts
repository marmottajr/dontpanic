import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../../../common/decorators/current-user.decorator';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { ProfilePermissionsService, permits } from './profile-permissions.service';

interface PrismaDouble {
  forTenant: jest.Mock;
  findUnique: jest.Mock;
}

/**
 * Prisma double that hands back whatever row the test wants from inside a
 * `forTenant` scope — the same shape the service reads.
 */
function makePrisma(row: unknown): PrismaDouble {
  const findUnique = jest.fn().mockResolvedValue(row);
  return {
    findUnique,
    forTenant: jest.fn((_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user: { findUnique } }),
    ),
  };
}

function makeService(row: unknown): { service: ProfilePermissionsService; prisma: PrismaDouble } {
  const prisma = makePrisma(row);
  return { prisma, service: new ProfilePermissionsService(prisma as unknown as PrismaService) };
}

const member: AuthUser = {
  id: 'u-1',
  email: 'member@dontpanic.dev',
  role: 'USER',
  tenantId: 't-1',
};

const asRequest = (over: Record<string, unknown> = {}): FastifyRequest =>
  ({ user: member, ...over }) as unknown as FastifyRequest;

const memberProfile = {
  code: 'MEMBER',
  permissions: [
    { module: 'settings', action: 'read' },
    { module: 'users', action: 'read' },
  ],
};

describe('ProfilePermissionsService', () => {
  it('peeks undefined before anything has been resolved', () => {
    const { service } = makeService(null);
    expect(service.peek(asRequest())).toBeUndefined();
  });

  it('resolves once per request and serves the cache afterwards', async () => {
    const { service, prisma } = makeService({ profile: memberProfile });
    const request = asRequest();

    const first = await service.resolve(request);
    const second = await service.resolve(request);

    expect(second).toBe(first);
    expect(prisma.forTenant).toHaveBeenCalledTimes(1);
    expect(service.peek(request)).toBe(first);
  });

  it('resolves again for a different request object', async () => {
    const { service, prisma } = makeService({ profile: memberProfile });
    await service.resolve(asRequest());
    await service.resolve(asRequest());
    expect(prisma.forTenant).toHaveBeenCalledTimes(2);
  });

  it('reads the profile inside the tenant scope, so RLS confirms ownership', async () => {
    const { service, prisma } = makeService({ profile: memberProfile });

    const resolved = await service.resolve(asRequest());

    expect(prisma.forTenant).toHaveBeenCalledWith('t-1', expect.any(Function));
    expect(prisma.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u-1' } }),
    );
    expect(resolved.profileCode).toBe('MEMBER');
    expect(permits(resolved, 'settings', 'read')).toBe(true);
  });

  it('grants nothing when there is no authenticated user', async () => {
    const { service, prisma } = makeService({ profile: memberProfile });

    const resolved = await service.resolve(asRequest({ user: undefined }));

    expect(resolved).toEqual({
      profileCode: null,
      granted: new Set(),
      unrestricted: false,
      platformOperator: false,
    });
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('grants nothing to a user with no profile — fails closed', async () => {
    const { service } = makeService({ profile: null });

    const resolved = await service.resolve(asRequest());

    expect(resolved).toMatchObject({ profileCode: null, unrestricted: false });
    expect(resolved.granted.size).toBe(0);
    expect(permits(resolved, 'settings', 'read')).toBe(false);
  });

  it('grants nothing when the user row itself is gone', async () => {
    const { service } = makeService(null);

    const resolved = await service.resolve(asRequest());

    expect(resolved.profileCode).toBeNull();
    expect(resolved.granted.size).toBe(0);
  });

  it('grants nothing for an unknown profile code with an empty permission list', async () => {
    // A profile row nobody filled in is not a free pass: it simply grants nothing.
    const { service } = makeService({ profile: { code: 'GHOST', permissions: [] } });

    const resolved = await service.resolve(asRequest());

    expect(resolved.profileCode).toBe('GHOST');
    expect(resolved.unrestricted).toBe(false);
    expect(permits(resolved, 'users', 'read')).toBe(false);
  });

  it('grants nothing to a non-SUPERADMIN without a company', async () => {
    const { service, prisma } = makeService({ profile: memberProfile });

    const resolved = await service.resolve(asRequest({ user: { ...member, tenantId: null } }));

    expect(resolved.granted.size).toBe(0);
    expect(resolved.unrestricted).toBe(false);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('lets the company ADMIN through without reading the profile table', async () => {
    const { service, prisma } = makeService(null);

    const resolved = await service.resolve(asRequest({ user: { ...member, role: 'ADMIN' } }));

    expect(resolved).toMatchObject({ profileCode: 'ADMIN', unrestricted: true });
    expect(permits(resolved, 'audit', 'delete')).toBe(true);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });

  it('marks the SUPERADMIN as platform operator, with no permission inside a company', async () => {
    const { service, prisma } = makeService(null);

    const resolved = await service.resolve(
      asRequest({ user: { ...member, role: 'SUPERADMIN', tenantId: null } }),
    );

    expect(resolved).toMatchObject({ platformOperator: true, unrestricted: false });
    expect(permits(resolved, 'users', 'read')).toBe(false);
    expect(prisma.forTenant).not.toHaveBeenCalled();
  });
});

describe('permits', () => {
  const from = (granted: string[], over: Record<string, unknown> = {}) => ({
    profileCode: 'MEMBER',
    granted: new Set(granted),
    unrestricted: false,
    platformOperator: false,
    ...over,
  });

  it('is true only for the exact module:action pair that was granted', () => {
    const resolved = from(['users:read', 'settings:update']);
    expect(permits(resolved, 'users', 'read')).toBe(true);
    expect(permits(resolved, 'settings', 'update')).toBe(true);
  });

  it('is false for a neighbouring action of a granted module', () => {
    const resolved = from(['users:read']);
    expect(permits(resolved, 'users', 'update')).toBe(false);
    expect(permits(resolved, 'users', 'delete')).toBe(false);
    expect(permits(resolved, 'users', 'approve')).toBe(false);
  });

  it('is false for another module with the same action', () => {
    expect(permits(from(['users:read']), 'audit', 'read')).toBe(false);
  });

  it('is false for everything when nothing was granted', () => {
    const resolved = from([]);
    expect(permits(resolved, 'settings', 'read')).toBe(false);
    expect(permits(resolved, 'audit', 'export')).toBe(false);
  });

  it('is true for anything when the profile is unrestricted', () => {
    const resolved = from([], { profileCode: 'ADMIN', unrestricted: true });
    expect(permits(resolved, 'audit', 'delete')).toBe(true);
    expect(permits(resolved, 'settings', 'approve')).toBe(true);
  });

  it('is false for the platform operator, the most privileged role of all', () => {
    const resolved = from([], { profileCode: null, platformOperator: true });
    expect(permits(resolved, 'users', 'read')).toBe(false);
  });
});
