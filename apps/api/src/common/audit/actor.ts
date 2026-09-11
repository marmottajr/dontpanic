import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../decorators/current-user.decorator';
import type { AuditActor } from './audit.util';

/**
 * Who performed the operation, for the audit row. The user comes from the JWT
 * (never from a header a client could forge); the address and the agent come
 * from the request itself.
 *
 * Anything missing stays null rather than being invented — an audit trail that
 * guesses is not evidence.
 */
export function actorOf(user: AuthUser | undefined, req: FastifyRequest): AuditActor {
  return {
    userId: user?.id ?? null,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}
