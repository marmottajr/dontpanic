import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Tenant } from '@prisma/client';
import {
  RESERVED_TENANT_SLUGS,
  type ChangePlanInput,
  type ExtendTrialInput,
  type Paginated,
  type PlatformCreateTenantInput,
  type PlatformCreateTenantResponse,
  type PlatformTenantDto,
  type PlatformTenantListQuery,
  type SuspendTenantInput,
} from '@dontpanic/shared';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { InvitationsService } from '../../invitations/invitations.service';
import { provisionTenant } from '../../tenants/support/tenant-provisioning';
import { runAsPlatform, type PlatformActor } from '../support/platform-scope';
import { writePlatformAudit } from '../support/platform-audit';

const RESERVED = new Set<string>(RESERVED_TENANT_SLUGS);

type TenantWithCount = Tenant & { _count: { users: number }; plan: { name: string } | null };

function toDto(tenant: TenantWithCount): PlatformTenantDto {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    legalName: tenant.legalName,
    taxId: tenant.taxId,
    email: tenant.email,
    phone: tenant.phone,
    status: tenant.status,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    planId: tenant.planId,
    planName: tenant.plan?.name ?? null,
    locale: tenant.locale,
    currency: tenant.currency,
    timezone: tenant.timezone,
    createdAt: tenant.createdAt.toISOString(),
    userCount: tenant._count.users,
    suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
    suspendedReason: tenant.suspendedReason,
    canceledAt: tenant.canceledAt?.toISOString() ?? null,
  };
}

const INCLUDE = { _count: { select: { users: true } }, plan: { select: { name: true } } } as const;

/**
 * The company's locale narrowed to a language we actually have templates for.
 * `Tenant.locale` is a free-form BCP-47 tag; handing `pt-PT` straight to the
 * mailer would fall through to whatever the template loader does with an
 * unknown key, and an invitation is a bad place to find that out.
 */
function mailLocale(locale: string): 'pt-BR' | 'en' {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'pt-BR';
}

/**
 * The operator's view of the customer base. Everything here runs in platform
 * scope — the only scope that crosses companies — and every change writes its
 * audit row in the same transaction (see `writePlatformAudit`).
 */
@Injectable()
export class PlatformTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
  ) {}

  async list(query: PlatformTenantListQuery): Promise<Paginated<PlatformTenantDto>> {
    const { page, limit, status, search } = query;
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { slug: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    return runAsPlatform(this.prisma, async (tx) => {
      const [total, rows] = await Promise.all([
        tx.tenant.count({ where }),
        tx.tenant.findMany({
          where,
          include: INCLUDE,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
      ]);
      return {
        items: rows.map(toDto),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    });
  }

  async get(id: string): Promise<PlatformTenantDto> {
    const tenant = await runAsPlatform(this.prisma, (tx) =>
      tx.tenant.findFirst({ where: { id, deletedAt: null }, include: INCLUDE }),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');
    return toDto(tenant);
  }

  /**
   * The operator creating a company for a customer — a sale closed on the
   * phone, a migration, an onboarding done for someone who will never see the
   * signup form.
   *
   * Two properties this shares with public signup, and both are the reason it
   * lives in one transaction: a company with no profiles, or a first
   * administrator invited into a company that was rolled back, is an orphan
   * nobody else knows how to repair. The company, its profiles, the invitation
   * and the audit row are written together or not at all.
   *
   * What it deliberately does **not** do is create a user. The first
   * administrator is invited: nobody on the vendor's side should ever know a
   * customer's credential, and an address typed by an operator is hearsay until
   * somebody proves it by accepting. So the acceptance is what mints the
   * account, exactly as it does for a colleague invited by a company ADMIN.
   */
  async create(
    input: PlatformCreateTenantInput,
    actor: PlatformActor,
  ): Promise<PlatformCreateTenantResponse> {
    const slug = input.slug.toLowerCase();
    const email = input.email.toLowerCase();
    const adminEmail = input.adminEmail.toLowerCase();

    // Reserved names collide with our own routes, so they are refused before
    // anything is read — the operator is not a special case here.
    if (RESERVED.has(slug)) throw new ConflictException('This address is not available');

    try {
      const created = await runAsPlatform(this.prisma, async (tx) => {
        // Friendly pre-check. It is not the guarantee — two operators (or an
        // operator and a self-serve signup) racing would both pass it — which
        // is why the unique-violation fallback below still exists. This only
        // turns the common case into a clear message instead of a 500.
        const [slugTaken, emailTaken] = await Promise.all([
          tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
          tx.user.findUnique({ where: { email: adminEmail }, select: { id: true } }),
        ]);
        if (slugTaken) throw new ConflictException('This address is not available');
        if (emailTaken) throw new ConflictException('An account with this email already exists');

        // A plan the operator named and we could not honour must fail loudly.
        // `provisionTenant` falls back to the default plan when it cannot find
        // the one it was given, which is right for signup and wrong here: the
        // operator is recording commercial terms, and silently billing the
        // customer on a different plan is the worst possible way to disagree.
        if (input.planId) {
          const plan = await tx.plan.findFirst({
            where: { id: input.planId, active: true },
            select: { id: true },
          });
          if (!plan) throw new BadRequestException('Plan not found');
        }

        const { tenant, adminProfileId } = await provisionTenant(tx, {
          slug,
          name: input.companyName,
          email,
          legalName: input.legalName ?? null,
          taxId: input.taxId ?? null,
          phone: input.phone ?? null,
          status: input.status,
          planId: input.planId ?? null,
          trialDays: input.trialDays,
          ...(input.locale ? { locale: input.locale } : {}),
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.timezone ? { timezone: input.timezone } : {}),
        });

        // Inside the transaction: the invitation row has to die with the
        // company if anything below fails. The mail does not — see after the
        // commit — because a delivered link pointing at a rolled-back company
        // is a support ticket nobody can close.
        const invitation = await this.invitations.issue(tx, {
          tenantId: tenant.id,
          email: adminEmail,
          name: input.adminName,
          role: 'ADMIN',
          profileId: adminProfileId,
          // The operator acted, so the operator is recorded. They belong to no
          // customer company, so the invitee never sees this name — it is here
          // for the audit answering "who let this person in?".
          invitedById: actor.id,
        });

        await writePlatformAudit(tx, {
          action: 'platform.tenant.create',
          tenantId: tenant.id,
          actor,
          // Nothing existed before, so there is no `valuesBefore` to record;
          // an empty object would read as "these fields were blank".
          valuesAfter: {
            slug: tenant.slug,
            name: tenant.name,
            status: tenant.status,
            planId: tenant.planId,
          },
          metadata: {
            adminEmail,
            invitationId: invitation.invitationId,
            sendInvitation: input.sendInvitation,
          },
        });

        // Re-read through INCLUDE: the DTO carries the user count and the plan
        // name, neither of which `tenant.create` returns.
        const row = await tx.tenant.findUniqueOrThrow({
          where: { id: tenant.id },
          include: INCLUDE,
        });
        return { dto: toDto(row), tenantName: row.name, locale: row.locale, invitation };
      });

      // Withheld invitation: the company and its invitation exist, only the
      // mail is not sent. For imports and for a customer being set up ahead of
      // a kickoff call — the invite goes out later from the detail page.
      if (!input.sendInvitation) return { tenant: created.dto, invitationSent: false };

      // After the commit, never inside it. A rollback with the mail already
      // gone would hand somebody a working-looking link to nothing.
      this.invitations.dispatchInvitationEmail({
        to: adminEmail,
        inviteeName: input.adminName,
        tenantName: created.tenantName,
        // No inviter name on purpose: the recipient is being handed a company,
        // not added by a colleague, and a vendor employee they have never dealt
        // with reads as a phishing attempt rather than as reassurance.
        inviterName: null,
        rawToken: created.invitation.rawToken,
        expiresAt: created.invitation.expiresAt,
        locale: mailLocale(created.locale),
      });

      return { tenant: created.dto, invitationSent: true };
    } catch (error) {
      // The race the pre-check cannot close: two companies taking the same slug
      // at once, or the administrator's address being claimed meanwhile.
      // Postgres decides, and we translate its verdict into the same 409.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        throw new ConflictException(
          target.includes('email')
            ? 'An account with this email already exists'
            : 'This address is not available',
        );
      }
      throw error;
    }
  }

  async suspend(
    id: string,
    input: SuspendTenantInput,
    actor: PlatformActor,
  ): Promise<PlatformTenantDto> {
    return this.transition(id, actor, 'platform.tenant.suspend', () => ({
      status: 'SUSPENDED' as const,
      suspendedAt: new Date(),
      suspendedReason: input.reason,
    }));
  }

  async reactivate(id: string, actor: PlatformActor): Promise<PlatformTenantDto> {
    return this.transition(id, actor, 'platform.tenant.reactivate', () => ({
      status: 'ACTIVE' as const,
      suspendedAt: null,
      suspendedReason: null,
      canceledAt: null,
    }));
  }

  async extendTrial(
    id: string,
    input: ExtendTrialInput,
    actor: PlatformActor,
  ): Promise<PlatformTenantDto> {
    return this.transition(id, actor, 'platform.tenant.extend_trial', (current) => {
      // Extend from whichever is later: an expired trial extends from today,
      // a live one from its current end. Otherwise "add 7 days" to a trial that
      // ended a month ago would still leave it expired.
      const from =
        current.trialEndsAt && current.trialEndsAt.getTime() > Date.now()
          ? current.trialEndsAt
          : new Date();
      return {
        status: 'TRIAL' as const,
        trialEndsAt: new Date(from.getTime() + input.days * 24 * 60 * 60 * 1000),
      };
    });
  }

  async changePlan(
    id: string,
    input: ChangePlanInput,
    actor: PlatformActor,
  ): Promise<PlatformTenantDto> {
    return this.transition(id, actor, 'platform.tenant.change_plan', async (current, tx) => {
      const plan = await tx.plan.findUnique({ where: { id: input.planId } });
      if (!plan) throw new BadRequestException('Plan not found');
      // Moving to a smaller plan is allowed even when the company is over the
      // new limit: the operator is fixing a commercial fact, and blocking the
      // change would leave them stuck. The limit then bites on the next create.
      return {
        planId: plan.id,
        ...(current.status === 'TRIAL' ? { status: 'ACTIVE' as const } : {}),
      };
    });
  }

  /** Every state change takes the same shape: read, patch, audit — atomically. */
  private async transition(
    id: string,
    actor: PlatformActor,
    action: string,
    patch: (
      current: Tenant,
      tx: Prisma.TransactionClient,
    ) => Prisma.TenantUpdateInput | Promise<Prisma.TenantUpdateInput>,
  ): Promise<PlatformTenantDto> {
    return runAsPlatform(this.prisma, async (tx) => {
      const current = await tx.tenant.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException('Tenant not found');

      const data = await patch(current, tx);
      const updated = await tx.tenant.update({ where: { id }, data, include: INCLUDE });

      await writePlatformAudit(tx, {
        action,
        tenantId: id,
        actor,
        valuesBefore: { status: current.status, planId: current.planId },
        valuesAfter: { status: updated.status, planId: updated.planId },
      });

      return toDto(updated);
    });
  }
}
