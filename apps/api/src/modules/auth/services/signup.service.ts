import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import {
  LEGAL_VERSIONS,
  RESERVED_TENANT_SLUGS,
  SYSTEM_PROFILES,
  permissionsForProfile,
  type SignupInput,
  type SignupResponse,
} from '@dontpanic/shared';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuthService, type RequestContext } from './auth.service';
import { toUserDto } from '../support/user.mapper';
import { toTenantDto } from '../support/tenant-access';

/** Used when no plan is flagged `isDefault`. */
const FALLBACK_TRIAL_DAYS = 14;

const RESERVED = new Set<string>(RESERVED_TENANT_SLUGS);

/**
 * Public company registration: creates the tenant, its system profiles and the
 * first user — that company's administrator.
 *
 * Runs in system scope (`@SystemScope()` on the controller) because there is no
 * tenant yet to derive a scope from, and **in a single transaction**: a company
 * with no profiles, or an administrator with no company, would be orphans
 * nobody else knows how to repair. If any step fails, nothing is created.
 */
@Injectable()
export class SignupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async signup(input: SignupInput, ctx: RequestContext): Promise<SignupResponse> {
    const slug = input.slug.toLowerCase();
    const email = input.email.toLowerCase();

    if (RESERVED.has(slug)) {
      throw new ConflictException('This address is not available');
    }

    // Friendly pre-check. It is not the guarantee — two simultaneous signups
    // would both pass it — which is why the unique-violation fallback below
    // still exists. This only turns the common case into a clear message.
    //
    // In system scope, and it has to be: there is no tenant yet, and under RLS
    // an unscoped read sees nothing — so every slug would look free and the
    // conflict would only surface as a unique violation from the database.
    const [slugTaken, emailTaken] = await this.prisma.asSystem(async (tx) =>
      Promise.all([
        tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
        tx.user.findUnique({ where: { email }, select: { id: true } }),
      ]),
    );
    if (slugTaken) throw new ConflictException('This address is not available');
    if (emailTaken) throw new ConflictException('An account with this email already exists');

    const passwordHash = await argon2.hash(input.password);

    try {
      const { tenant, user, planName } = await this.prisma.asSystem(async (tx) => {
        const plan = await tx.plan.findFirst({ where: { isDefault: true, active: true } });
        const trialDays = plan?.trialDays ?? FALLBACK_TRIAL_DAYS;
        const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

        const tenant = await tx.tenant.create({
          data: {
            slug,
            name: input.companyName,
            email,
            phone: input.companyPhone ?? null,
            taxId: input.taxId ?? null,
            status: 'TRIAL',
            trialEndsAt,
            planId: plan?.id ?? null,
          },
        });

        // Profiles come from the same shared matrix the seed uses, so a company
        // created by signup and one created by the seed cannot drift apart.
        let adminProfileId: string | null = null;
        for (const { code, name } of SYSTEM_PROFILES) {
          const profile = await tx.profile.create({
            data: { tenantId: tenant.id, code, name, system: true },
          });
          if (code === 'ADMIN') adminProfileId = profile.id;
          const permissions = permissionsForProfile(code);
          if (permissions.length > 0) {
            await tx.permission.createMany({
              data: permissions.map((p) => ({ profileId: profile.id, ...p })),
            });
          }
        }

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email,
            name: input.name,
            passwordHash,
            role: 'ADMIN',
            profileId: adminProfileId,
          },
        });

        // The acceptance is proof, so it is written in the same transaction as
        // the account it belongs to: no account exists without its evidence.
        await tx.legalAcceptance.createMany({
          data: [
            { document: 'TERMS_OF_USE' as const, version: LEGAL_VERSIONS.terms },
            { document: 'PRIVACY_POLICY' as const, version: LEGAL_VERSIONS.privacy },
          ].map((doc) => ({
            ...doc,
            tenantId: tenant.id,
            userId: user.id,
            ip: ctx.ip ?? null,
            userAgent: ctx.userAgent ?? null,
          })),
        });

        return { tenant, user, planName: plan?.name ?? null };
      });

      await this.auth.sendVerificationCode(user.id, user.email, user.name, ctx.locale ?? 'pt-BR');
      await this.auth.audit('auth.signup', user.id, ctx, { tenantId: tenant.id, slug });

      return {
        user: toUserDto(user),
        tenant: toTenantDto(tenant, planName ? { name: planName } : null),
      };
    } catch (error) {
      // The race the pre-check cannot close: two signups taking the same slug
      // or e-mail at once. Postgres decides, and we translate its verdict.
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
}
