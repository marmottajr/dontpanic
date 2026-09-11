import type { FastifyRequest } from 'fastify';
import { actorOf } from './actor';

describe('actorOf', () => {
  it('takes the user from the JWT and the rest from the request', () => {
    const actor = actorOf({ id: 'user-1', email: 'a@b.c', role: 'USER', tenantId: 'tenant-1' }, {
      ip: '1.2.3.4',
      headers: { 'user-agent': 'jest' },
    } as unknown as FastifyRequest);

    expect(actor).toEqual({ userId: 'user-1', ip: '1.2.3.4', userAgent: 'jest' });
  });

  it('leaves everything null when there is no user and no headers', () => {
    const actor = actorOf(undefined, { headers: {} } as unknown as FastifyRequest);

    expect(actor).toEqual({ userId: null, ip: null, userAgent: null });
  });
});
