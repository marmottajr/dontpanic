import { makeTableStore, type StoredRow, type TableStore } from './table-store';

/**
 * The in-memory Prisma double, exercised on its own.
 *
 * It needs no database and nothing booted — it lives in the e2e run only
 * because that is the Jest project whose `testRegex` reaches files under
 * `test/`; the unit project's `rootDir` is `src`.
 */
describe('makeTableStore', () => {
  let store: TableStore;

  beforeEach(() => {
    store = makeTableStore();
  });

  it('stores what createMany was given, under the delegate name asked for', async () => {
    const result = await store.tx.user.createMany({
      data: [{ email: 'arthur@dent.dev' }, { email: 'ford@prefect.dev' }],
    });

    expect(result).toEqual({ count: 2 });
    expect(store.rows('user').map((row) => row.email)).toEqual([
      'arthur@dent.dev',
      'ford@prefect.dev',
    ]);
    // Every row gets an id, and no two rows share one.
    const ids = store.rows('user').map((row) => row.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('keeps tables apart and reports only the ones with rows', async () => {
    await store.tx.user.createMany({ data: [{ email: 'arthur@dent.dev' }] });
    await store.tx.refreshToken.createMany({ data: [{ token: 'a' }, { token: 'b' }] });
    // Touching a delegate must not conjure a table into `tables()`.
    await store.tx.auditLog.findMany();

    expect(store.tables().sort()).toEqual(['refreshToken', 'user']);
    expect(store.count()).toBe(3);
  });

  it('filters findMany by equality, treating an unwritten column as null', async () => {
    await store.tx.user.createMany({
      data: [
        { email: 'arthur@dent.dev', role: 'ADMIN' },
        { email: 'ford@prefect.dev', role: 'USER' },
        { email: 'trillian@heart.dev' }, // role never written
      ],
    });

    expect(await store.tx.user.findMany()).toHaveLength(3);
    expect(
      (await store.tx.user.findMany({ where: { role: 'ADMIN' } })).map((r: StoredRow) => r.email),
    ) //
      .toEqual(['arthur@dent.dev']);
    // An absent column matches an explicit null.
    expect(
      (await store.tx.user.findMany({ where: { role: null } })).map((r: StoredRow) => r.email),
    ).toEqual(['trillian@heart.dev']);
  });

  it('filters findMany by `in`', async () => {
    await store.tx.user.createMany({
      data: [{ role: 'ADMIN' }, { role: 'USER' }, { role: 'SUPPORT' }],
    });

    const found = await store.tx.user.findMany({ where: { role: { in: ['ADMIN', 'SUPPORT'] } } });
    expect(found.map((row: StoredRow) => row.role)).toEqual(['ADMIN', 'SUPPORT']);
  });

  it('seeds pre-existing rows, distinguishable from the ones the code wrote', async () => {
    store.seed('user', [{ email: 'zaphod@beeble.dev' }]);
    await store.tx.user.createMany({ data: [{ email: 'arthur@dent.dev' }] });

    const [seeded, created] = store.rows('user');
    expect(seeded.id).toMatch(/^user-seed-/);
    expect(created.id).not.toMatch(/-seed-/);
    // Seeded rows are visible to the code under test, like any other row.
    expect(await store.tx.user.findMany({ where: { email: 'zaphod@beeble.dev' } })).toHaveLength(1);
  });

  it('hands out the same delegate through delegatesFor and through tx', async () => {
    const delegates = store.delegatesFor(['user', 'refreshToken']);
    expect(Object.keys(delegates).sort()).toEqual(['refreshToken', 'user']);
    expect(delegates.user).toBe(store.tx.user);

    // So a spy taken from either side sees the writes made through the other.
    await store.tx.user.createMany({ data: [{ email: 'arthur@dent.dev' }] });
    expect(delegates.user.createMany).toHaveBeenCalledTimes(1);
  });
});
