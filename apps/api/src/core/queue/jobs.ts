import type { MailMessage } from '../mail/mail.provider';

/**
 * The job catalogue: one place where a name and its payload are declared
 * together, so `enqueue` and the handler cannot drift apart. Adding a job means
 * adding a line here and a case in the router — the compiler finds the rest.
 */
export interface JobPayloads {
  /**
   * Transactional mail. The template is rendered at enqueue time, so the job is
   * self-contained and a later template change never rewrites mail already in
   * the queue.
   */
  'mail.send': { message: MailMessage };
  /**
   * Deletes password-reset and e-mail-verification rows that are past their
   * expiry. Repeatable, and safe to run twice.
   */
  'tokens.purge-expired': Record<string, never>;
}

export type JobName = keyof JobPayloads;

/**
 * What travels with every job besides its payload.
 *
 * `tenantId` is the important one. A handler runs outside any request, so there
 * is no scope to inherit: without this the worker would read under no scope at
 * all and RLS would return nothing — the job would "succeed" having seen an
 * empty database. It is captured automatically at enqueue time.
 */
export interface JobEnvelopeOf<N extends JobName> {
  name: N;
  payload: JobPayloads[N];
  tenantId: string | null;
}

/**
 * A discriminated union over the catalogue, not a generic with a default: only
 * the union lets a `switch (envelope.name)` narrow the payload per case, and
 * lets the `never` in the default arm fail the build when a job is added
 * without a handler.
 */
export type JobEnvelope = { [N in JobName]: JobEnvelopeOf<N> }[JobName];
