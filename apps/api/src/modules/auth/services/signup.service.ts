import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import {
  LEGAL_VERSIONS,
  RESERVED_TENANT_SLUGS,
  type SignupInput,
  type SignupResponse,
} from '@dontpanic/shared';
import type { Env } from '../../../config/env';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { provisionTenant } from '../../tenants/support/tenant-provisioning';
import { AuthService, type RequestContext } from './auth.service';
import { toUserDto } from '../support/user.mapper';
import { toTenantDto } from '../support/tenant-access';

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
    private readonly config: ConfigService<Env, true>,
    private readonly auth: AuthService,
  ) {}

  async signup(input: SignupInput, ctx: RequestContext): Promise<SignupResponse> {
    // Whether strangers may create companies at all is a deployment decision —
    // an internal tool or a sales-led product wants the only doors in to be an
    // invitation and the seed. It is checked here rather than in a guard
    // because the API is the boundary that actually decides: the web app has
    // its own NEXT_PUBLIC_SIGNUP_ENABLED, that copy can be stale or simply
    // disagree, and a form that renders against a closed API answers 403 on
    // every submit. Same trap as the captcha driver — the two halves must
    // agree, and this half is the one that is authoritative.
    if (!this.config.get('PUBLIC_SIGNUP_ENABLED', { infer: true })) {
      throw new ForbiddenException('Public registration is closed.');
    }

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
        // Same helper the platform panel and the OAuth completion use, so a
        // company is a company however it got here.
        const { tenant, adminProfileId, planName } = await provisionTenant(tx, {
          slug,
          name: input.companyName,
          email,
          phone: input.companyPhone ?? null,
          taxId: input.taxId ?? null,
          status: 'TRIAL',
        });

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

        return { tenant, user, planName };
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
