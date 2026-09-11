/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A minimal in-memory database for testing code that writes many rows.
 *
 * A mock built out of `jest.fn()` delegates proves *that* a service called
 * Prisma. It does not prove *what landed*. As soon as a piece of code inserts
 * dozens of rows across several tables, with dependencies between them (the
 * parent row before the child, the owner before the thing it owns), and has to
 * be repeatable, none of that is readable from a list of calls — but it is
 * readable from the rows.
 *
 * Supports exactly what such code uses: `createMany` (with generated ids) and
 * `findMany` with an equality `where` and an `{ in: [...] }` one. Deliberately
 * little: a double that accepted everything would stop failing the moment the
 * code started doing something real Prisma does not allow.
 */
export type StoredRow = Record<string, any>;

export interface TableStore {
  /** A client shaped like `Prisma.TransactionClient`, to hand to the code. */
  tx: any;
  /** The rows of one table, by delegate name (`user`, `refreshToken`, …). */
  rows(table: string): StoredRow[];
  /** Every table that has rows. */
  tables(): string[];
  /** Total rows stored. */
  count(): number;
  /** Seed rows that already existed, as if something had created them before. */
  seed(table: string, rows: StoredRow[]): void;
  /** Named delegates, to merge into another mock's delegates. */
  delegatesFor(tables: readonly string[]): Record<string, any>;
}

function matches(row: StoredRow, where: StoredRow): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (condition !== null && typeof condition === 'object' && 'in' in condition) {
      return (condition.in as unknown[]).includes(row[field]);
    }
    // `null` and absent are the same thing: a nullable column left unwritten.
    return (row[field] ?? null) === (condition ?? null);
  });
}

export function makeTableStore(): TableStore {
  const data = new Map<string, StoredRow[]>();
  const delegates = new Map<string, any>();
  let sequence = 0;

  const rowsOf = (table: string): StoredRow[] => {
    const existing = data.get(table);
    if (existing) return existing;
    const created: StoredRow[] = [];
    data.set(table, created);
    return created;
  };

  const delegateFor = (table: string): any => {
    const existing = delegates.get(table);
    if (existing) return existing;
    const delegate = {
      createMany: jest.fn(async ({ data: payload }: { data: StoredRow[] }) => {
        for (const row of payload) {
          sequence += 1;
          rowsOf(table).push({ id: `${table}-${sequence}`, ...row });
        }
        return { count: payload.length };
      }),
      findMany: jest.fn(async ({ where = {} }: { where?: StoredRow } = {}) =>
        rowsOf(table).filter((row) => matches(row, where)),
      ),
    };
    delegates.set(table, delegate);
    return delegate;
  };

  const tx = new Proxy(
    {},
    {
      get: (_target, property: string | symbol) =>
        typeof property === 'string' ? delegateFor(property) : undefined,
    },
  );

  return {
    tx,
    rows: (table) => rowsOf(table),
    tables: () => [...data.entries()].filter(([, rows]) => rows.length > 0).map(([name]) => name),
    count: () => [...data.values()].reduce((sum, rows) => sum + rows.length, 0),
    seed: (table, rows) => {
      for (const row of rows) {
        sequence += 1;
        rowsOf(table).push({ id: `${table}-seed-${sequence}`, ...row });
      }
    },
    delegatesFor: (tables) =>
      Object.fromEntries(tables.map((table) => [table, delegateFor(table)])),
  };
}
