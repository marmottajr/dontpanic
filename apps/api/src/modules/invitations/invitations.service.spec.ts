import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import { LEGAL_VERSIONS } from '@dontpanic/shared';
import { makePrismaMock } from '../../../test/prisma-mock';
import { TenantContext } from '../../infra/tenancy/tenant-context';
import { sha256 } from '../auth/support/crypto.util';
import { InvitationsService } from './invitations.service';

jest.mock('argon2');

const TENANT = 'tenant-42';
const ADMIN = 'admin-1';
const ctx = { ip: '1.2.3.4', userAgent: 'UA', locale: 'en' as const };

const ENV: Record<string, unknown> = {
  WEB_ORIGIN: 'https://app.dontpanic.dev',
  INVITATION_TTL_HOURS: 168,
  INVITATION_MAX_RESENDS: 5,
};

const HOUR = 60 * 60 * 1000;

const invitationRow = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  tenantId: TENANT,
  email: 'arthur@dent.dev',
  name: 'Arthur',
  role: 'USER',
  profileId: null,
  profile: null,
  tokenHash: 'old-hash',
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 24 * HOUR),
  invitedById: ADMIN,
  invitedBy: { name: 'Marvin' },
  acceptedAt: null,
  acceptedUserId: null,
  revokedAt: null,
  resentCount: 0,
  lastSentAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  ...over,
});

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'user-9',
  tenantId: TENANT,
  email: 'arthur@dent.dev',
  name: 'Arthur',
  avatarUrl: null,
  role: 'USER',
  emailVerified: true,
  twoFactorEnabled: false,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  ...over,
});

function uniqueViolation(target = 'invitations_tenant_email_pending_key') {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

/** Lets a queued rejection reach its `.catch` before the assertion runs. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('InvitationsService', () => {
  const mockedArgon = argon2 as jest.Mocked<typeof argon2>;

  let prisma: any;
  let queue: any;
  let tokenService: any;
  let planLimits: any;
  let service: InvitationsService;

  /** Runs `fn` as an authenticated ADMIN of TENANT would — the scope the JWT sets. */
  const asTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    TenantContext.run({ scope: { kind: 'tenant', tenantId: TENANT } }, fn);

  beforeEach(() => {
    mockedArgon.hash.mockResolvedValue('hashed-pw');

    prisma = makePrismaMock({
      invitation: {
        create: jest.fn(async ({ data }: any) => ({ ...invitationRow(), ...data, id: 'inv-1' })),
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(invitationRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(invitationRow()),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Two very different lookups share the delegate: by e-mail (does this
      // address already have an account?) and by id (who is inviting?).
      user: {
        findUnique: jest.fn(async ({ where }: any) => (where.id ? { name: 'Marvin' } : null)),
        create: jest.fn(async ({ data }: any) => userRow(data)),
      },
      tenant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: 'Sirius Cybernetics' }) },
      profile: { findFirst: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
      legalAcceptance: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    });

    queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
    tokenService = {
      issueTokensForUser: jest
        .fn()
        .mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh' }),
    };
    planLimits = { assertCanAddUser: jest.fn().mockResolvedValue(undefined) };

    const config = { get: (key: string) => ENV[key] } as never;
    service = new InvitationsService(prisma, config, tokenService, planLimits, queue);
  });

  // ── issue / dispatch: the two halves the platform panel composes on ───────

  describe('issue', () => {
    it('stores only the hash and hands the raw token back to the caller', async () => {
      const before = Date.now();
      const result = await service.issue(prisma, {
        tenantId: TENANT,
        email: 'Arthur@Dent.dev',
        name: 'Arthur',
        role: 'USER',
        invitedById: ADMIN,
      });

      const data = prisma.invitation.create.mock.calls[0][0].data;
      expect(data.tokenHash).toBe(sha256(result.rawToken));
      // The raw token must exist in the mail and nowhere else — a leaked
      // database has to yield no usable links.
      expect(JSON.stringify(data)).not.toContain(result.rawToken);
      expect(data.email).toBe('arthur@dent.dev');
      expect(Math.round((data.expiresAt.getTime() - before) / HOUR)).toBe(168);
      expect(result.invitationId).toBe('inv-1');
    });

    /**
     * The Zod schema already caps the role, but `issue` is also reachable from
     * the platform panel and from scripts, which never saw that schema. A
     * company ADMIN who can mint a SUPERADMIN has left their own tenant.
     */
    it('refuses to invite a role outside ADMIN/USER', async () => {
      await expect(
        service.issue(prisma, { tenantId: TENANT, email: 'x@y.dev', role: 'SUPERADMIN' as never }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('turns the partial-index violation into a 409, not a 500', async () => {
      prisma.invitation.create.mockRejectedValue(uniqueViolation());
      await expect(
        service.issue(prisma, { tenantId: TENANT, email: 'x@y.dev', role: 'USER' }),
      ).rejects.toThrow('There is already a pending invitation for this address');
    });

    it('lets any other database failure through untranslated', async () => {
      prisma.invitation.create.mockRejectedValue(new Error('connection reset'));
      await expect(
        service.issue(prisma, { tenantId: TENANT, email: 'x@y.dev', role: 'USER' }),
      ).rejects.toThrow('connection reset');
    });
  });

  describe('dispatchInvitationEmail', () => {
    it('queues the mail with the link the invitee will click', () => {
      const expiresAt = new Date(Date.now() + 24 * HOUR);
      service.dispatchInvitationEmail({
        to: 'arthur@dent.dev',
        inviteeName: 'Arthur',
        tenantName: 'Sirius Cybernetics',
        inviterName: 'Marvin',
        rawToken: 'raw-token',
        expiresAt,
        locale: 'en',
      });

      const [name, payload, options] = queue.enqueue.mock.calls[0];
      expect(name).toBe('mail.send');
      expect(payload.message.to).toBe('arthur@dent.dev');
      expect(payload.message.html).toContain('https://app.dontpanic.dev/invite/raw-token');
      expect(payload.message.text).toContain('https://app.dontpanic.dev/invite/raw-token');
      // Keyed on the token, so a retried request cannot mail twice while a
      // genuine resend (new token) is a different job.
      expect(options.jobId).toBe(`invitation:${sha256('raw-token')}`);
    });

    it('swallows a queue outage — resend is the recovery path, not a 500', async () => {
      queue.enqueue.mockRejectedValue(new Error('redis down'));
      expect(() =>
        service.dispatchInvitationEmail({
          to: 'arthur@dent.dev',
          tenantName: 'Sirius',
          rawToken: 'raw-token',
          expiresAt: new Date(),
        }),
      ).not.toThrow();
      await flush();
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const input = { email: 'Arthur@Dent.dev', name: 'Arthur', role: 'USER' as const };

    it('writes the row, audits it, and mails only after the transaction', async () => {
      const dto = await asTenant(() => service.create(ADMIN, input, ctx));

      expect(prisma.invitation.create).toHaveBeenCalled();
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        tenantId: TENANT,
        action: 'invitation.created',
        entityId: 'inv-1',
        userId: ADMIN,
      });
      // The mail carries the tenant and inviter names read inside the tx.
      const payload = queue.enqueue.mock.calls[0][1];
      expect(payload.message.html).toContain('Sirius Cybernetics');
      expect(payload.message.html).toContain('Marvin');
      expect(dto.status).toBe('PENDING');
      expect(dto.invitedByName).toBe('Marvin');
    });

    it('asks the plan for a seat before mailing anybody', async () => {
      planLimits.assertCanAddUser.mockRejectedValue(new BadRequestException('no seats'));
      await expect(asTenant(() => service.create(ADMIN, input, ctx))).rejects.toThrow('no seats');
      expect(prisma.invitation.create).not.toHaveBeenCalled();
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('refuses an address that already belongs to a user of this company', async () => {
      prisma.user.findUnique.mockImplementation(async ({ where }: any) =>
        where.id ? { name: 'Marvin' } : { id: 'user-existing' },
      );
      await expect(asTenant(() => service.create(ADMIN, input, ctx))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('refuses a profile that belongs to another company', async () => {
      prisma.profile.findFirst.mockResolvedValue(null);
      await expect(
        asTenant(() => service.create(ADMIN, { ...input, profileId: 'profile-x' }, ctx)),
      ).rejects.toThrow('Unknown profile');
    });

    it('refuses while a live invitation for that address is still pending', async () => {
      prisma.invitation.findFirst.mockResolvedValue(invitationRow());
      await expect(asTenant(() => service.create(ADMIN, input, ctx))).rejects.toThrow(
        'There is already a pending invitation for this address',
      );
      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('accepts a profile of this company and pins the invitation to it', async () => {
      prisma.invitation.findUniqueOrThrow.mockResolvedValue(
        invitationRow({ profileId: 'profile-1', profile: { name: 'Members' } }),
      );
      const dto = await asTenant(() =>
        service.create(ADMIN, { ...input, profileId: 'profile-1' }, ctx),
      );

      expect(prisma.profile.findFirst).toHaveBeenCalledWith({
        where: { id: 'profile-1', tenantId: TENANT },
        select: { id: true },
      });
      expect(dto.profileName).toBe('Members');
    });

    // Every optional is genuinely optional: no courtesy name, an inviter whose
    // account has since been deleted (`onDelete: SetNull`), and a request with
    // no context to record. None of them may become "undefined" in a row.
    it('copes with no name, no surviving inviter and no request context', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findUniqueOrThrow.mockResolvedValue(
        invitationRow({ name: null, invitedBy: null }),
      );

      const dto = await asTenant(() =>
        service.create(ADMIN, { email: input.email, role: 'USER' }, {}),
      );

      expect(prisma.invitation.create.mock.calls[0][0].data.name).toBeNull();
      expect(dto.invitedByName).toBeNull();
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        ip: null,
        userAgent: null,
      });
      // No inviter name to show, and the default locale for the mail.
      const html = queue.enqueue.mock.calls[0][1].message.html;
      expect(html).toContain('Você foi convidado para fazer parte de');
    });

    /**
     * The partial unique index only knows the stored status, and an expired row
     * is still PENDING there. Without retiring it, one invitation that timed out
     * would bar that address from ever being invited again.
     */
    it('retires an expired pending row so the same address can be invited again', async () => {
      prisma.invitation.findFirst.mockResolvedValue(
        invitationRow({ id: 'inv-old', expiresAt: new Date(Date.now() - HOUR) }),
      );
      await asTenant(() => service.create(ADMIN, input, ctx));

      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-old' },
        data: { status: 'REVOKED', revokedAt: expect.any(Date) },
      });
      expect(prisma.invitation.create).toHaveBeenCalled();
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('derives EXPIRED at read time instead of trusting the column', async () => {
      prisma.invitation.count.mockResolvedValue(3);
      prisma.invitation.findMany.mockResolvedValue([
        invitationRow({ id: 'a' }),
        invitationRow({ id: 'b', expiresAt: new Date(Date.now() - HOUR), invitedBy: null }),
        invitationRow({
          id: 'c',
          status: 'ACCEPTED',
          acceptedAt: new Date('2026-09-02T00:00:00Z'),
          profile: { name: 'Members' },
          profileId: 'profile-1',
        }),
      ]);

      const page = await asTenant(() => service.list({ page: 1, limit: 20 } as never));

      expect(page.items.map((i) => i.status)).toEqual(['PENDING', 'EXPIRED', 'ACCEPTED']);
      expect(page.items[1].invitedByName).toBeNull();
      expect(page.items[2].profileName).toBe('Members');
      expect(page.items[2].acceptedAt).toBe('2026-09-02T00:00:00.000Z');
      expect(page.total).toBe(3);
      expect(page.totalPages).toBe(1);
    });

    it('turns a filter on the derived EXPIRED into a query on the clock', async () => {
      await asTenant(() => service.list({ page: 1, limit: 20, status: 'EXPIRED' } as never));
      const where = prisma.invitation.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PENDING');
      expect(where.expiresAt.lte).toBeInstanceOf(Date);
    });

    it('excludes the expired ones when asked for PENDING', async () => {
      await asTenant(() => service.list({ page: 1, limit: 20, status: 'PENDING' } as never));
      const where = prisma.invitation.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PENDING');
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
    });

    it('passes a stored status straight through, and paginates and searches', async () => {
      await asTenant(() =>
        service.list({ page: 3, limit: 10, search: 'ford', status: 'REVOKED' } as never),
      );
      const arg = prisma.invitation.findMany.mock.calls[0][0];
      expect(arg.where.status).toBe('REVOKED');
      expect(arg.where.expiresAt).toBeUndefined();
      expect(JSON.stringify(arg.where.OR)).toContain('ford');
      expect(arg.skip).toBe(20);
      expect(arg.take).toBe(10);
    });
  });

  // ── resend ────────────────────────────────────────────────────────────────

  describe('resend', () => {
    it('mints a NEW token, which is what kills the old link', async () => {
      prisma.invitation.findUnique.mockResolvedValue(invitationRow());

      await asTenant(() => service.resend(ADMIN, 'inv-1', ctx));

      const data = prisma.invitation.update.mock.calls[0][0].data;
      expect(data.tokenHash).not.toBe('old-hash');
      expect(data.resentCount).toEqual({ increment: 1 });
      expect(data.lastSentAt).toBeInstanceOf(Date);
      // The deadline moves too: an invitation nobody received is renewed, not
      // resurrected as an already-dead link.
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // …and the mail carries the token that now matches the stored hash.
      const link = queue.enqueue.mock.calls[0][1].message.text.match(/invite\/(\S+)/)[1];
      expect(sha256(link)).toBe(data.tokenHash);
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('invitation.resent');
    });

    it('renews an expired invitation — the row that blocks re-inviting', async () => {
      prisma.invitation.findUnique.mockResolvedValue(
        invitationRow({ expiresAt: new Date(Date.now() - HOUR) }),
      );
      const dto = await asTenant(() => service.resend(ADMIN, 'inv-1', ctx));
      expect(prisma.invitation.update).toHaveBeenCalled();
      expect(dto.id).toBe('inv-1');
    });

    it('refuses to resend something already accepted or revoked', async () => {
      prisma.invitation.findUnique.mockResolvedValue(invitationRow({ status: 'ACCEPTED' }));
      await expect(asTenant(() => service.resend(ADMIN, 'inv-1', ctx))).rejects.toThrow(
        'Only a pending invitation can be resent',
      );
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('stops at INVITATION_MAX_RESENDS so resend is not a mailing tool', async () => {
      prisma.invitation.findUnique.mockResolvedValue(invitationRow({ resentCount: 5 }));
      await expect(asTenant(() => service.resend(ADMIN, 'inv-1', ctx))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.invitation.update).not.toHaveBeenCalled();
    });

    it('answers 404 for an id this company cannot see', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      await expect(asTenant(() => service.resend(ADMIN, 'ghost', ctx))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── revoke ────────────────────────────────────────────────────────────────

  describe('revoke', () => {
    it('marks it REVOKED and audits, keeping the hash so the link resolves', async () => {
      prisma.invitation.findUnique.mockResolvedValue(invitationRow());
      prisma.invitation.findUniqueOrThrow.mockResolvedValue(
        invitationRow({ status: 'REVOKED', revokedAt: new Date('2026-09-05T00:00:00Z') }),
      );

      const dto = await asTenant(() => service.revoke(ADMIN, 'inv-1', ctx));

      const data = prisma.invitation.update.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'REVOKED' });
      expect(data.tokenHash).toBeUndefined();
      expect(dto.status).toBe('REVOKED');
      expect(dto.revokedAt).toBe('2026-09-05T00:00:00.000Z');
      expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe('invitation.revoked');
    });

    it('refuses to revoke what is no longer pending', async () => {
      prisma.invitation.findUnique.mockResolvedValue(invitationRow({ status: 'REVOKED' }));
      await expect(asTenant(() => service.revoke(ADMIN, 'inv-1', ctx))).rejects.toThrow(
        'Only a pending invitation can be revoked',
      );
    });

    it('answers 404 for an id this company cannot see', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);
      await expect(asTenant(() => service.revoke(ADMIN, 'ghost', ctx))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── preview ───────────────────────────────────────────────────────────────

  describe('preview', () => {
    it('says what is being joined, and nothing more', async () => {
      prisma.invitation.findUnique.mockResolvedValue(
        invitationRow({ tenant: { name: 'Sirius Cybernetics' } }),
      );
      const preview = await service.preview('raw-token');

      expect(prisma.invitation.findUnique.mock.calls[0][0].where.tokenHash).toBe(
        sha256('raw-token'),
      );
      expect(preview).toEqual({
        email: 'arthur@dent.dev',
        name: 'Arthur',
        tenantName: 'Sirius Cybernetics',
        expiresAt: expect.any(String),
      });
      // No inviter, no company id, no user count: the token travels through mail
      // clients and proxies, so what it unlocks is treated as semi-public.
      expect(Object.keys(preview).sort()).toEqual(['email', 'expiresAt', 'name', 'tenantName']);
    });

    /**
     * One answer for every reason. Telling "never existed" from "already used"
     * from "revoked" would hand anyone holding a leaked mailbox archive a free
     * oracle for which links are worth trying.
     */
    it.each([
      ['unknown', null],
      ['revoked', invitationRow({ status: 'REVOKED', tenant: { name: 'S' } })],
      ['accepted', invitationRow({ status: 'ACCEPTED', tenant: { name: 'S' } })],
      ['expired', invitationRow({ expiresAt: new Date(Date.now() - HOUR), tenant: { name: 'S' } })],
    ])('answers the same refusal for a %s token', async (_label, row) => {
      prisma.invitation.findUnique.mockResolvedValue(row);
      await expect(service.preview('raw-token')).rejects.toThrow('Invitation is no longer valid');
    });
  });

  // ── accept ────────────────────────────────────────────────────────────────

  describe('accept', () => {
    const input = {
      token: 'raw-token',
      name: 'Arthur Dent',
      password: 'Sup3rSecret!',
      acceptTerms: true as const,
    };

    beforeEach(() => {
      prisma.invitation.findUnique.mockResolvedValue(invitationRow({ profileId: 'profile-1' }));
    });

    it('creates a verified account, records the acceptance and signs them in', async () => {
      const result = await service.accept(input, ctx);

      expect(prisma.user.create.mock.calls[0][0].data).toMatchObject({
        tenantId: TENANT,
        email: 'arthur@dent.dev',
        name: 'Arthur Dent',
        passwordHash: 'hashed-pw',
        role: 'USER',
        profileId: 'profile-1',
        // The click on a mailed link IS the proof of possession — unlike an
        // admin's word, which is what the flow this replaces relied on.
        emailVerified: true,
      });

      expect(prisma.legalAcceptance.createMany.mock.calls[0][0].data).toEqual([
        {
          document: 'TERMS_OF_USE',
          version: LEGAL_VERSIONS.terms,
          tenantId: TENANT,
          userId: 'user-9',
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        {
          document: 'PRIVACY_POLICY',
          version: LEGAL_VERSIONS.privacy,
          tenantId: TENANT,
          userId: 'user-9',
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
      ]);

      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { status: 'ACCEPTED', acceptedAt: expect.any(Date), acceptedUserId: 'user-9' },
      });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: 'invitation.accepted',
        tenantId: TENANT,
        userId: 'user-9',
      });

      expect(tokenService.issueTokensForUser).toHaveBeenCalledWith(
        { id: 'user-9', email: 'arthur@dent.dev', role: 'USER', tenantId: TENANT },
        { ip: ctx.ip, userAgent: ctx.userAgent },
      );
      expect(result.tokens.accessToken).toBe('access');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    /**
     * This is the authoritative seat check — the invite-time one is a courtesy.
     * The tenant comes from the resolved invitation, because the route runs in
     * system scope and there is no tenant before the token is read.
     */
    it('consumes the seat under the resolved tenant, in the same transaction', async () => {
      let seenTenant: string | undefined;
      planLimits.assertCanAddUser.mockImplementation(async () => {
        seenTenant = TenantContext.requireTenantId();
      });

      await service.accept(input, ctx);

      expect(seenTenant).toBe(TENANT);
      expect(planLimits.assertCanAddUser).toHaveBeenCalledWith(prisma);
    });

    it('refuses when the plan has no seat left, before creating anything', async () => {
      planLimits.assertCanAddUser.mockRejectedValue(new BadRequestException('no seats'));
      await expect(service.accept(input, ctx)).rejects.toThrow('no seats');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('records an anonymous acceptance when the request carries no context', async () => {
      await service.accept(input, {});
      expect(prisma.legalAcceptance.createMany.mock.calls[0][0].data[0]).toMatchObject({
        ip: null,
        userAgent: null,
      });
    });

    it.each([
      ['unknown', null],
      ['revoked', invitationRow({ status: 'REVOKED' })],
      ['accepted', invitationRow({ status: 'ACCEPTED' })],
      ['expired', invitationRow({ expiresAt: new Date(Date.now() - HOUR) })],
      ['privilege-escalating', invitationRow({ role: 'SUPERADMIN' })],
    ])('answers the same refusal for a %s invitation', async (_label, row) => {
      prisma.invitation.findUnique.mockResolvedValue(row);
      await expect(service.accept(input, ctx)).rejects.toThrow('Invitation is no longer valid');
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('refuses when the address grew an account while the invitation waited', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-existing' });
      await expect(service.accept(input, ctx)).rejects.toThrow(
        'An account with this email already exists',
      );
    });

    // The pre-check above cannot see an account being created right now.
    it('turns the losing side of that race into the same 409', async () => {
      prisma.user.create.mockRejectedValue(uniqueViolation('users_email_key'));
      await expect(service.accept(input, ctx)).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets any other failure through untranslated', async () => {
      prisma.user.create.mockRejectedValue(new Error('connection reset'));
      await expect(service.accept(input, ctx)).rejects.toThrow('connection reset');
    });
  });
});
