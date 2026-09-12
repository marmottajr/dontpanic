/* eslint-disable @typescript-eslint/no-explicit-any */
import { Logger } from '@nestjs/common';
import { makePrismaMock } from '../../../test/prisma-mock';
import type { JobEnvelope } from '../../core/queue/jobs';
import { JobRouter } from './job-router.service';

const MESSAGE = {
  to: 'arthur@dent.dev',
  subject: 'Reset your password — DontPanic',
  html: '<p>Don’t Panic.</p>',
  text: 'Don’t Panic.',
};

const mailJob = (tenantId: string | null): JobEnvelope => ({
  name: 'mail.send',
  payload: { message: MESSAGE },
  tenantId,
});

const purgeJob = (tenantId: string | null): JobEnvelope => ({
  name: 'tokens.purge-expired',
  payload: {},
  tenantId,
});

describe('JobRouter', () => {
  let prisma: any;
  let mail: { send: jest.Mock };
  let router: JobRouter;

  beforeEach(() => {
    prisma = makePrismaMock({
      passwordResetToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      emailVerificationToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    mail = { send: jest.fn().mockResolvedValue(undefined) };
    router = new JobRouter(prisma, mail as never);
  });

  // --- scope -------------------------------------------------------------
  //
  // The most expensive thing to get wrong here. A job runs outside any request,
  // so it inherits no scope; without re-establishing one, RLS matches nothing
  // and the handler "succeeds" against what looks like an empty database.

  describe('tenant scope', () => {
    it('runs a job carrying a tenantId inside that tenant’s scope', async () => {
      await router.run(mailJob('tenant-42'));

      expect(prisma.forTenant).toHaveBeenCalledTimes(1);
      expect(prisma.forTenant.mock.calls[0][0]).toBe('tenant-42');
      expect(prisma.asSystem).not.toHaveBeenCalled();
      expect(mail.send).toHaveBeenCalledWith(MESSAGE);
    });

    it('runs a job with no tenantId in system scope', async () => {
      await router.run(purgeJob(null));

      expect(prisma.asSystem).toHaveBeenCalledTimes(1);
      expect(prisma.forTenant).not.toHaveBeenCalled();
    });

    it('does the work INSIDE forTenant, not merely alongside it', async () => {
      // A wrapper that never invokes its callback: if the handler still ran,
      // the work was escaping the scope and no `SET LOCAL` would apply to it.
      // Asserting the side effect alone would not catch that.
      prisma.forTenant.mockImplementation(async () => undefined);

      await router.run(mailJob('tenant-42'));

      expect(mail.send).not.toHaveBeenCalled();
    });

    it('does the work INSIDE asSystem, not merely alongside it', async () => {
      prisma.asSystem.mockImplementation(async () => undefined);

      await router.run(purgeJob(null));

      expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    });

    it('treats an empty-string tenantId as no tenant rather than scoping to ""', async () => {
      // Falsy, so it takes the system branch. Worth pinning: scoping to "" would
      // silently match nothing and the job would report success having read none.
      await router.run(purgeJob(''));

      expect(prisma.forTenant).not.toHaveBeenCalled();
      expect(prisma.asSystem).toHaveBeenCalledTimes(1);
    });
  });

  // --- dispatch ----------------------------------------------------------

  describe('mail.send', () => {
    it('hands the enqueued message to the mail provider untouched', async () => {
      await router.run(mailJob('tenant-42'));

      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send).toHaveBeenCalledWith(MESSAGE);
    });

    it('lets a send failure propagate, so the queue retries it', async () => {
      // Swallowing here would turn every transient SMTP blip into mail that is
      // silently never delivered — the queue only retries what fails loudly.
      mail.send.mockRejectedValue(new Error('smtp down'));

      await expect(router.run(mailJob('tenant-42'))).rejects.toThrow('smtp down');
    });
  });

  describe('unknown job name', () => {
    it('throws instead of ignoring it', async () => {
      // Reached when a newer deploy enqueued a job this worker does not know.
      // Failing gets it retried once the worker catches up; ignoring drops it.
      const fromTheFuture = {
        name: 'reports.generate',
        payload: {},
        tenantId: null,
      } as unknown as JobEnvelope;

      await expect(router.run(fromTheFuture)).rejects.toThrow(
        'No handler for job "reports.generate"',
      );
    });
  });

  // --- tokens.purge-expired ----------------------------------------------

  describe('tokens.purge-expired', () => {
    it('deletes only rows already past their expiry, in both token tables', async () => {
      const before = Date.now();
      await router.run(purgeJob(null));
      const after = Date.now();

      for (const delegate of [prisma.passwordResetToken, prisma.emailVerificationToken]) {
        expect(delegate.deleteMany).toHaveBeenCalledTimes(1);
        const where = delegate.deleteMany.mock.calls[0][0].where;
        // `lt`, never `lte`/`gt`: a token that has not expired yet is still
        // usable, and deleting it would break a reset link in someone's inbox.
        expect(Object.keys(where)).toEqual(['expiresAt']);
        expect(Object.keys(where.expiresAt)).toEqual(['lt']);
        expect(where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before);
        expect(where.expiresAt.lt.getTime()).toBeLessThanOrEqual(after);
      }
    });

    it('is safe to run twice — the second pass is just another no-op delete', async () => {
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 3 });
      prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 2 });
      await router.run(purgeJob(null));

      // Nothing left the second time round; idempotence is what lets the cron
      // overlap itself or a worker retry without any special casing.
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(router.run(purgeJob(null))).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledTimes(2);
      expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledTimes(2);
    });

    it('reports how much it purged when it purged something', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 3 });
      prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 2 });

      await router.run(purgeJob(null));

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Purged 5 expired tokens'));
      log.mockRestore();
    });

    it('stays quiet when there was nothing to purge', async () => {
      // An hourly cron that logged every no-op would bury the runs that matter.
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      await router.run(purgeJob(null));

      expect(log).not.toHaveBeenCalled();
      log.mockRestore();
    });
  });
});
