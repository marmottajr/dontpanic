import { Inject, Injectable, Logger } from '@nestjs/common';
import { MAIL_PROVIDER, type MailProvider } from '../../core/mail/mail.provider';
import type { JobEnvelope } from '../../core/queue/jobs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Runs one job, in the right tenant scope.
 *
 * The scope is the part that is easy to get wrong. A handler runs outside any
 * request, so it inherits nothing: read without re-establishing the scope and
 * RLS returns zero rows — the job finishes "successfully" having seen an empty
 * database. So every job is wrapped:
 *
 *  - with a `tenantId`: the company's own scope, exactly like a request;
 *  - without one: system scope, which crosses companies. Only maintenance work
 *    is enqueued that way (`systemWide: true`), and it is as narrow an
 *    exception here as `@SystemScope()` is on a route.
 */
@Injectable()
export class JobRouter {
  private readonly logger = new Logger(JobRouter.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  async run(envelope: JobEnvelope): Promise<void> {
    const work = () => this.dispatch(envelope);
    if (envelope.tenantId) {
      await this.prisma.forTenant(envelope.tenantId, work);
      return;
    }
    await this.prisma.asSystem(work);
  }

  private async dispatch(envelope: JobEnvelope): Promise<void> {
    switch (envelope.name) {
      case 'mail.send':
        // Errors propagate: that is what makes the queue retry, and it is the
        // whole reason mail moved off the request path.
        await this.mail.send(envelope.payload.message);
        return;

      case 'tokens.purge-expired':
        await this.purgeExpiredTokens();
        return;

      default: {
        // An unknown name means a job was enqueued by a newer deploy than this
        // worker. Failing loudly gets it retried once the worker catches up,
        // instead of dropping it.
        const unknown: never = envelope;
        throw new Error(`No handler for job "${(unknown as JobEnvelope).name}"`);
      }
    }
  }

  /**
   * Single-use credentials that nobody consumed. Keeping them is a liability
   * with no upside: an expired token is already refused, and the row is one
   * more place a password-reset link lives.
   */
  private async purgeExpiredTokens(): Promise<void> {
    const now = new Date();
    const [resets, verifications] = await Promise.all([
      this.prisma.db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.db.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    const total = resets.count + verifications.count;
    if (total > 0) {
      this.logger.log(
        `Purged ${total} expired tokens (${resets.count} reset, ${verifications.count} verification).`,
      );
    }
  }
}
