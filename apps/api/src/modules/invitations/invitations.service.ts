import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import type { Invitation, InvitationStatus as StoredStatus } from '@prisma/client';
import {
  LEGAL_VERSIONS,
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type InvitationDto,
  type InvitationListQuery,
  type InvitationPreview,
  type InvitationStatus,
  type Paginated,
  type UserDto,
} from '@dontpanic/shared';
import type { Env } from '../../config/env';
import { writeAudit } from '../../common/audit/audit.util';
import { QUEUE_PROVIDER, type QueueProvider } from '../../core/queue/queue.provider';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TenantContext } from '../../infra/tenancy/tenant-context';
import { TokenService, type IssuedTokens } from '../auth/services/token.service';
import { generateRawToken, sha256 } from '../auth/support/crypto.util';
import type { EmailLocale } from '../auth/support/email-templates';
import { toUserDto } from '../auth/support/user.mapper';
import { PlanLimitsService } from '../tenants/services/plan-limits.service';
import { invitationEmail } from './support/invitation-email';

/** Context captured from the request, for audit rows and the e-mail language. */
export interface InvitationContext {
  ip?: string | null;
  userAgent?: string | null;
  locale?: EmailLocale;
}

/** What the accept route hands back to the controller, which sets the cookies. */
export interface AcceptedInvitation {
  user: UserDto;
  tokens: IssuedTokens;
}

/**
 * The roles a tenant ADMIN may hand out.
 *
 * A Set of plain strings rather than a type-level check on purpose: the Zod
 * schema already refuses SUPERADMIN, and this is the second lock. A caller that
 * reaches `issue()` from anywhere but the HTTP layer — the platform panel
 * creating a company, a future script — never passed through that schema.
 */
const INVITABLE_ROLES = new Set<string>(['ADMIN', 'USER']);

/**
 * The one message every refusal on the accept path uses.
 *
 * Revoked, expired, already accepted and simply-wrong-token are indistinguishable
 * to the caller by design. Telling them apart would answer, for free, "is this
 * token real?" and "did somebody already use it?" — an oracle for anyone holding
 * a leaked mailbox archive.
 */
const INVALID_INVITATION = 'Invitation is no longer valid';

type InvitationRow = Invitation & {
  profile?: { name: string } | null;
  invitedBy?: { name: string } | null;
};

/**
 * Invitations: the only door into a company that already exists.
 *
 * The flow it replaces was "an admin types a password for someone else", which
 * is wrong in two ways that no amount of care fixes — the admin learns a
 * credential that is not theirs, and nothing ever proves the address belongs to
 * the person who will use it. Here the invitee sets their own password, and the
 * click on a mailed link is itself the proof of possession.
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly tokenService: TokenService,
    private readonly planLimits: PlanLimitsService,
    @Inject(QUEUE_PROVIDER) private readonly queue: QueueProvider,
  ) {}

  // ── The two halves other modules compose on ───────────────────────────────

  /**
   * Writes the invitation row inside a transaction the caller already opened.
   *
   * Split from `dispatchInvitationEmail` deliberately, and the split is the
   * whole point: the row is created atomically with whatever the caller is also
   * creating (a company and its first administrator, in the platform panel),
   * while the mail leaves only after that transaction commits. Sending inside
   * the transaction would put a working link in somebody's inbox pointing at a
   * row a rollback then removed — an invitation that 404s, from an address the
   * recipient cannot ask about because they have no account yet.
   *
   * Returns the raw token. It exists here, in the e-mail, and nowhere else:
   * only its SHA-256 hash reaches the database.
   */
  async issue(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      email: string;
      name?: string | null;
      role: 'ADMIN' | 'USER';
      profileId?: string | null;
      invitedById?: string | null;
    },
  ): Promise<{ invitationId: string; rawToken: string; expiresAt: Date }> {
    // Privilege escalation is the failure this guards: a company ADMIN who can
    // mint a SUPERADMIN has just left their own tenant. Checked here and not
    // only in the schema — fail closed, on the layer that actually writes.
    if (!INVITABLE_ROLES.has(input.role)) {
      throw new ForbiddenException('That role cannot be invited');
    }

    const email = input.email.toLowerCase();
    const rawToken = generateRawToken();
    const expiresAt = this.expiryFromNow();

    try {
      const invitation = await tx.invitation.create({
        data: {
          tenantId: input.tenantId,
          email,
          name: input.name ?? null,
          role: input.role,
          profileId: input.profileId ?? null,
          tokenHash: sha256(rawToken),
          expiresAt,
          invitedById: input.invitedById ?? null,
          lastSentAt: new Date(),
        },
      });
      return { invitationId: invitation.id, rawToken, expiresAt };
    } catch (error) {
      // `invitations_tenant_email_pending_key` — at most one live invitation per
      // address per company. Two admins inviting the same colleague at the same
      // moment both pass the pre-check; Postgres decides, and its verdict has to
      // read like the friendly message rather than a 500.
      throw this.translatePendingConflict(error);
    }
  }

  /**
   * Hands the invitation mail to the queue. Call it **after** the transaction
   * that produced the token has committed — see `issue`.
   *
   * Fire-and-forget for the same reason `AuthService.dispatchMail` is: a slow
   * SMTP host must not slow the response, and a failure to enqueue (Redis down)
   * is recovered through "resend", not by failing an invitation that was in
   * fact created.
   */
  dispatchInvitationEmail(params: {
    to: string;
    inviteeName?: string | null;
    tenantName: string;
    inviterName?: string | null;
    rawToken: string;
    expiresAt: Date;
    locale?: EmailLocale;
  }): void {
    const origin = this.config.get('WEB_ORIGIN', { infer: true });
    const mail = invitationEmail({
      inviteeName: params.inviteeName,
      tenantName: params.tenantName,
      inviterName: params.inviterName,
      link: `${origin}/invite/${params.rawToken}`,
      expiresAt: params.expiresAt,
      locale: params.locale,
    });

    void this.queue
      .enqueue(
        'mail.send',
        { message: { to: params.to, subject: mail.subject, html: mail.html, text: mail.text } },
        // Keyed on the token's hash, not the address: a retried request carries
        // the same token and must not mail twice, while a genuine resend has a
        // new token and is a different job.
        { jobId: `invitation:${sha256(params.rawToken)}` },
      )
      .catch((err: unknown) => {
        this.logger.warn(`Could not enqueue invitation mail to ${params.to}: ${String(err)}`);
      });
  }

  // ── Admin routes ──────────────────────────────────────────────────────────

  async create(
    actorId: string,
    input: CreateInvitationInput,
    ctx: InvitationContext,
  ): Promise<InvitationDto> {
    // From the signed `tid` claim by way of the request scope — never from the
    // body, where it would be the caller choosing which company to join.
    const tenantId = TenantContext.requireTenantId();
    const email = input.email.toLowerCase();

    const { dto, rawToken, expiresAt, tenantName, inviterName } = await this.prisma.atomic(
      async (tx) => {
        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { name: true },
        });

        // A friendly pre-check, NOT the guarantee. The seat is consumed on
        // acceptance, and that is where the advisory lock settles the race —
        // here it only spares an admin from mailing an invitation the plan has
        // no room for.
        await this.planLimits.assertCanAddUser(tx);

        // Read inside the tenant scope on purpose: an address that belongs to
        // another company reads as absent, and the invitation goes out. Saying
        // "that person already has an account" would turn this route into a
        // cross-tenant user directory.
        const existing = await tx.user.findUnique({ where: { email }, select: { id: true } });
        if (existing) {
          throw new ConflictException('That address already belongs to a user of this company');
        }

        if (input.profileId) await this.requireProfile(tx, tenantId, input.profileId);

        await this.retireStalePending(tx, tenantId, email);

        const { invitationId, rawToken, expiresAt } = await this.issue(tx, {
          tenantId,
          email,
          name: input.name ?? null,
          role: input.role,
          profileId: input.profileId ?? null,
          invitedById: actorId,
        });

        const row = await this.loadRow(tx, invitationId);
        const inviter = await tx.user.findUnique({
          where: { id: actorId },
          select: { name: true },
        });

        await writeAudit(tx, {
          tenantId,
          action: 'invitation.created',
          entity: 'invitation',
          entityId: invitationId,
          actor: { userId: actorId, ip: ctx.ip, userAgent: ctx.userAgent },
          metadata: { email, role: input.role },
        });

        return {
          dto: this.toDto(row),
          rawToken,
          expiresAt,
          tenantName: tenant.name,
          inviterName: inviter?.name ?? null,
        };
      },
    );

    this.dispatchInvitationEmail({
      to: email,
      inviteeName: input.name ?? null,
      tenantName,
      inviterName,
      rawToken,
      expiresAt,
      locale: ctx.locale,
    });

    return dto;
  }

  async list(query: InvitationListQuery): Promise<Paginated<InvitationDto>> {
    const { page, limit, search, status } = query;
    const now = new Date();

    const where: Prisma.InvitationWhereInput = {};
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    // EXPIRED is not a stored state, so filtering on it means asking for PENDING
    // rows past their deadline — and asking for PENDING means excluding them.
    // Reading the column alone would list a dead invitation as live.
    if (status === 'EXPIRED') {
      where.status = 'PENDING';
      where.expiresAt = { lte: now };
    } else if (status === 'PENDING') {
      where.status = 'PENDING';
      where.expiresAt = { gt: now };
    } else if (status) {
      where.status = status;
    }

    // One transaction so the count and the page come from the same snapshot.
    const [total, rows] = await this.prisma.atomic(async (tx) =>
      Promise.all([
        tx.invitation.count({ where }),
        tx.invitation.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { profile: { select: { name: true } }, invitedBy: { select: { name: true } } },
        }),
      ]),
    );

    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Resend: a **new** token, and the old one stops working the moment it is
   * overwritten. Re-mailing the same token would mean every copy of every
   * previous mail stays a valid key for as long as the invitation lives.
   *
   * Works on an expired-but-PENDING row too, and that is the point: the partial
   * unique index counts it as live, so until it is renewed or retired nobody can
   * invite that address again.
   */
  async resend(
    actorId: string,
    invitationId: string,
    ctx: InvitationContext,
  ): Promise<InvitationDto> {
    const tenantId = TenantContext.requireTenantId();
    const maxResends = this.config.get('INVITATION_MAX_RESENDS', { infer: true });

    const { dto, rawToken, expiresAt, tenantName, inviterName, email, inviteeName } =
      await this.prisma.atomic(async (tx) => {
        const current = await this.requireInvitation(tx, invitationId);
        if (current.status !== 'PENDING') {
          throw new BadRequestException('Only a pending invitation can be resent');
        }
        if (current.resentCount >= maxResends) {
          throw new BadRequestException(
            `This invitation has already been resent ${maxResends} times. ` +
              'Revoke it and send a new one, or check why the address is not receiving mail.',
          );
        }

        const tenant = await tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { name: true },
        });

        const rawToken = generateRawToken();
        const expiresAt = this.expiryFromNow();
        await tx.invitation.update({
          where: { id: invitationId },
          data: {
            tokenHash: sha256(rawToken),
            expiresAt,
            resentCount: { increment: 1 },
            lastSentAt: new Date(),
          },
        });

        const row = await this.loadRow(tx, invitationId);
        const inviter = await tx.user.findUnique({
          where: { id: actorId },
          select: { name: true },
        });

        await writeAudit(tx, {
          tenantId,
          action: 'invitation.resent',
          entity: 'invitation',
          entityId: invitationId,
          actor: { userId: actorId, ip: ctx.ip, userAgent: ctx.userAgent },
          metadata: { email: current.email, resentCount: current.resentCount + 1 },
        });

        return {
          dto: this.toDto(row),
          rawToken,
          expiresAt,
          tenantName: tenant.name,
          inviterName: inviter?.name ?? null,
          email: current.email,
          inviteeName: current.name,
        };
      });

    this.dispatchInvitationEmail({
      to: email,
      inviteeName,
      tenantName,
      inviterName,
      rawToken,
      expiresAt,
      locale: ctx.locale,
    });

    return dto;
  }

  async revoke(
    actorId: string,
    invitationId: string,
    ctx: InvitationContext,
  ): Promise<InvitationDto> {
    const tenantId = TenantContext.requireTenantId();

    return this.prisma.atomic(async (tx) => {
      const current = await this.requireInvitation(tx, invitationId);
      if (current.status !== 'PENDING') {
        throw new BadRequestException('Only a pending invitation can be revoked');
      }

      // The token hash is left in place. Revocation is decided by `status`, and
      // keeping the hash means a later attempt with the mailed link resolves to
      // this row and is refused — rather than resolving to nothing, which is the
      // same answer a forged token gets and tells an operator nothing.
      await tx.invitation.update({
        where: { id: invitationId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      await writeAudit(tx, {
        tenantId,
        action: 'invitation.revoked',
        entity: 'invitation',
        entityId: invitationId,
        actor: { userId: actorId, ip: ctx.ip, userAgent: ctx.userAgent },
        metadata: { email: current.email },
      });

      return this.toDto(await this.loadRow(tx, invitationId));
    });
  }

  // ── Public routes (system scope) ──────────────────────────────────────────

  /**
   * What the accept screen shows before anyone types anything.
   *
   * Answers only "is this link still good, and what am I joining?". A refusal is
   * the same 404 whatever the reason — see `INVALID_INVITATION`.
   */
  async preview(rawToken: string): Promise<InvitationPreview> {
    const row = await this.prisma.db.invitation.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { tenant: { select: { name: true } } },
    });
    if (!row || this.deriveStatus(row) !== 'PENDING') {
      throw new NotFoundException(INVALID_INVITATION);
    }

    return {
      email: row.email,
      name: row.name,
      tenantName: row.tenant.name,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /**
   * Accepting: the account is born here, already signed in.
   *
   * Every write is in one transaction — the user, the legal acceptance and the
   * invitation being marked used. A user created without their acceptance, or an
   * invitation still PENDING after producing an account, are both states nobody
   * can repair from the outside.
   */
  async accept(input: AcceptInvitationInput, ctx: InvitationContext): Promise<AcceptedInvitation> {
    const invalid = (): never => {
      throw new BadRequestException(INVALID_INVITATION);
    };

    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.atomic(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { tokenHash: sha256(input.token) },
      });
      if (!invitation || this.deriveStatus(invitation) !== 'PENDING') return invalid();
      // A stored role outside the invitable set means the row was written by
      // something that skipped `issue()`. Refuse rather than mint it.
      if (!INVITABLE_ROLES.has(invitation.role)) return invalid();

      const tenantId = invitation.tenantId;

      const existing = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('An account with this email already exists');
      }

      // The authoritative seat check. `PlanLimitsService` reads the tenant from
      // the request context, and this route deliberately runs in system scope
      // (there is no tenant to derive one from before the token is resolved), so
      // the resolved tenant is supplied here — with the SAME transaction, which
      // is what keeps the advisory lock and the count around the write that
      // consumes the seat.
      await TenantContext.run({ scope: { kind: 'tenant', tenantId }, tx }, () =>
        this.planLimits.assertCanAddUser(tx),
      );

      let created;
      try {
        created = await tx.user.create({
          data: {
            tenantId,
            email: invitation.email,
            name: input.name,
            passwordHash,
            role: invitation.role,
            profileId: invitation.profileId,
            // Legitimate here, and it was not in the flow this replaces. The
            // person clicked a link that only reached that mailbox: the click
            // IS the proof of possession. An admin typing "yes, that's their
            // address" proved nothing at all.
            emailVerified: true,
          },
        });
      } catch (error) {
        // The race the pre-check above cannot close: the same address accepting
        // two invitations at once, or signing up meanwhile.
        if (this.isUniqueViolation(error)) {
          throw new ConflictException('An account with this email already exists');
        }
        throw error;
      }

      await tx.legalAcceptance.createMany({
        data: [
          { document: 'TERMS_OF_USE' as const, version: LEGAL_VERSIONS.terms },
          { document: 'PRIVACY_POLICY' as const, version: LEGAL_VERSIONS.privacy },
        ].map((doc) => ({
          ...doc,
          tenantId,
          userId: created.id,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
        })),
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedUserId: created.id },
      });

      await writeAudit(tx, {
        tenantId,
        action: 'invitation.accepted',
        entity: 'invitation',
        entityId: invitation.id,
        actor: { userId: created.id, ip: ctx.ip, userAgent: ctx.userAgent },
        metadata: { email: invitation.email, role: invitation.role },
      });

      return created;
    });

    // Signing them in is the difference between "your account exists" and being
    // inside the app. Same mint as login, so the session is indistinguishable
    // from one — including the rotation family it starts.
    const tokens = await this.tokenService.issueTokensForUser(
      { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      { ip: ctx.ip, userAgent: ctx.userAgent },
    );

    return { user: toUserDto(user), tokens };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private expiryFromNow(): Date {
    const hours = this.config.get('INVITATION_TTL_HOURS', { infer: true });
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * EXPIRED is computed, never stored — see the enum in the schema. A row whose
   * deadline passed is still PENDING in the column, and reporting it as live is
   * how a UI ends up offering an action the API refuses.
   */
  private deriveStatus(
    row: { status: StoredStatus; expiresAt: Date },
    now: Date = new Date(),
  ): InvitationStatus {
    return row.status === 'PENDING' && row.expiresAt <= now ? 'EXPIRED' : row.status;
  }

  private toDto(row: InvitationRow): InvitationDto {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      profileId: row.profileId,
      profileName: row.profile?.name ?? null,
      status: this.deriveStatus(row),
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      invitedByName: row.invitedBy?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private loadRow(tx: Prisma.TransactionClient, id: string): Promise<InvitationRow> {
    return tx.invitation.findUniqueOrThrow({
      where: { id },
      include: { profile: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
  }

  /**
   * Under RLS an invitation of another company reads as absent, so a 404 here
   * is both the honest answer and the non-leaking one.
   */
  private async requireInvitation(tx: Prisma.TransactionClient, id: string): Promise<Invitation> {
    const row = await tx.invitation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Invitation not found');
    return row;
  }

  /** A profile from another company would attach the invitee to a foreign role. */
  private async requireProfile(
    tx: Prisma.TransactionClient,
    tenantId: string,
    profileId: string,
  ): Promise<void> {
    const profile = await tx.profile.findFirst({
      where: { id: profileId, tenantId },
      select: { id: true },
    });
    if (!profile) throw new BadRequestException('Unknown profile');
  }

  /**
   * Retires a PENDING invitation that has already expired, so the same address
   * can be invited again.
   *
   * The partial unique index only knows the stored status, and an expired row is
   * still PENDING there. Without this, one invitation that timed out would block
   * that address from ever being invited again — the index enforcing a rule
   * nobody meant.
   */
  private async retireStalePending(
    tx: Prisma.TransactionClient,
    tenantId: string,
    email: string,
  ): Promise<void> {
    const pending = await tx.invitation.findFirst({
      where: { tenantId, email, status: 'PENDING' },
    });
    if (!pending) return;
    if (pending.expiresAt > new Date()) {
      throw new ConflictException('There is already a pending invitation for this address');
    }
    await tx.invitation.update({
      where: { id: pending.id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private translatePendingConflict(error: unknown): unknown {
    if (this.isUniqueViolation(error)) {
      return new ConflictException('There is already a pending invitation for this address');
    }
    return error;
  }
}
