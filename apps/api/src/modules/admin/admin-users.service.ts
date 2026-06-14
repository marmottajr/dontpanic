import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Prisma, User } from '@prisma/client';
import type {
  AdminCreateUserInput,
  AdminUser,
  AdminUserList,
  PaginationQuery,
  Role,
} from '@dontpanic/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { TokenService } from '../auth/services/token.service';

/** Request context for audit logging the acting admin's actions. */
export interface AdminContext {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Admin-only user administration. Reached through AdminUsersController, which is
 * gated by RolesGuard + @Roles('ADMIN') — the activation of the RBAC machinery.
 * Self-targeting destructive actions (role, lock, delete) are blocked so an admin
 * can't lock itself out, and every mutation is written to the audit log.
 */
@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  private toAdminUser(u: User): AdminUser {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      emailVerified: u.emailVerified,
      twoFactorEnabled: u.twoFactorEnabled,
      locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
      deleted: Boolean(u.deletedAt),
      createdAt: u.createdAt.toISOString(),
    };
  }

  async list(query: PaginationQuery): Promise<AdminUserList> {
    const { page, limit, search } = query;
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: users.map((u) => this.toAdminUser(u)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async create(
    adminId: string,
    input: AdminCreateUserInput,
    ctx: AdminContext,
  ): Promise<AdminUser> {
    const email = input.email.toLowerCase();
    // Reject any existing email, including soft-deleted rows that still hold the
    // unique index (a soft-deleted account keeps its address) — avoids a 500.
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: { email, name: input.name, passwordHash, role: input.role, emailVerified: true },
    });
    await this.audit('admin.user_created', adminId, ctx, {
      targetId: user.id,
      email,
      role: user.role,
    });
    return this.toAdminUser(user);
  }

  async setRole(
    adminId: string,
    targetId: string,
    role: Role,
    ctx: AdminContext,
  ): Promise<AdminUser> {
    if (adminId === targetId) {
      throw new BadRequestException("You can't change your own role");
    }
    await this.requireUser(targetId);
    const updated = await this.prisma.user.update({ where: { id: targetId }, data: { role } });
    await this.audit('admin.role_changed', adminId, ctx, { targetId, role });
    return this.toAdminUser(updated);
  }

  async setLocked(
    adminId: string,
    targetId: string,
    locked: boolean,
    ctx: AdminContext,
  ): Promise<AdminUser> {
    if (adminId === targetId) {
      throw new BadRequestException("You can't lock your own account");
    }
    await this.requireUser(targetId);
    // A century out is effectively permanent; unlock clears it.
    const lockedUntil = locked ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) : null;
    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { lockedUntil, failedLoginAttempts: 0 },
    });
    if (locked) await this.tokenService.revokeAllForUser(targetId);
    await this.audit(locked ? 'admin.user_locked' : 'admin.user_unlocked', adminId, ctx, {
      targetId,
    });
    return this.toAdminUser(updated);
  }

  async softDelete(adminId: string, targetId: string, ctx: AdminContext): Promise<void> {
    if (adminId === targetId) {
      throw new BadRequestException("You can't delete your own account here");
    }
    await this.requireUser(targetId);
    // Soft-delete AND anonymize (same as LGPD erasure): scrub PII and free the
    // email so a brand-new account can reuse it. The row stays for audit lineage.
    await this.prisma.user.update({
      where: { id: targetId },
      data: {
        deletedAt: new Date(),
        email: `deleted+${randomUUID()}@deleted.invalid`,
        name: 'Deleted user',
        avatarUrl: null,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        passwordHash: await argon2.hash(randomUUID()),
      },
    });
    await this.tokenService.revokeAllForUser(targetId);
    await this.audit('admin.user_deleted', adminId, ctx, { targetId });
  }

  private async requireUser(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async audit(
    action: string,
    actorId: string,
    ctx: AdminContext,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          userId: actorId,
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          metadata: metadata as object,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to write audit log "${action}": ${String(err)}`);
    }
  }
}
