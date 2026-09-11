/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Test double for PrismaService.
 *
 * Services no longer talk to the database through `this.prisma.<model>`: they go
 * through `this.prisma.db` (the request transaction that already declared the
 * tenant to Postgres) and through `this.prisma.atomic` (several writes in one
 * transaction). A plain bag of delegates is not enough any more — the double
 * also has to expose:
 *
 *  - `db`, which here IS the mock itself, so `prisma.user.create` stays the very
 *    same jest.fn the service ends up calling via `prisma.db.user.create`;
 *  - `atomic`, `withScope`, `forTenant`, `asPlatform` and `asSystem`, which just
 *    run the callback with that same client (in a unit test there is no real
 *    transaction and no RLS to satisfy).
 */
export interface PrismaMock {
  db: any;
  atomic: jest.Mock;
  withScope: jest.Mock;
  forTenant: jest.Mock;
  asPlatform: jest.Mock;
  asSystem: jest.Mock;
  $transaction: jest.Mock;
  [delegate: string]: any;
}

export function makePrismaMock<T extends Record<string, any>>(
  delegates: T = {} as T,
): PrismaMock & T {
  const mock = delegates as unknown as PrismaMock & T;

  // Self-reference: `mock.db.user === mock.user`, so assertions written against
  // the delegates keep working unchanged.
  Object.defineProperty(mock, 'db', { get: () => mock, configurable: true });

  mock.atomic = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mock));
  // Scope switches (see PrismaService.withScope): in the double they are just
  // one more call against the same client.
  mock.withScope = jest.fn(async (_scope: unknown, fn: (tx: any) => Promise<unknown>) => fn(mock));
  mock.forTenant = jest.fn(async (_tenantId: string, fn: (tx: any) => Promise<unknown>) =>
    fn(mock),
  );
  mock.asPlatform = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mock));
  mock.asSystem = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(mock));
  // Kept for the array form still used by code outside this migration.
  mock.$transaction = jest.fn(async (arg: any) =>
    typeof arg === 'function' ? arg(mock) : Promise.all(arg),
  );

  return mock;
}
