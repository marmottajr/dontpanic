import { AdminProfilesController } from './admin-profiles.controller';

describe('AdminProfilesController', () => {
  function setup(rows: unknown[] = []) {
    const findMany = jest.fn().mockResolvedValue(rows);
    const prisma = { db: { profile: { findMany } } };
    return { controller: new AdminProfilesController(prisma as never), findMany };
  }

  it('returns the profiles the picker needs', async () => {
    const rows = [
      { id: 'p1', code: 'ADMIN', name: 'Administrator', system: true },
      { id: 'p2', code: 'SALES', name: 'Sales', system: false },
    ];
    const { controller } = setup(rows);

    await expect(controller.list()).resolves.toEqual(rows);
  });

  // Reading through `prisma.db` is what puts the query inside the request's
  // tenant transaction. Reaching for a model on the base client instead would
  // leave it unscoped, and under RLS that returns nothing at all — a dropdown
  // that is silently always empty.
  it('reads through the scoped client', async () => {
    const { controller, findMany } = setup();
    await controller.list();
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('asks for no field beyond what the dropdown renders and sends', async () => {
    const { controller, findMany } = setup();
    await controller.list();

    // Widening this select would put the company's access table on the wire
    // every time a dialog opens.
    expect(findMany.mock.calls[0][0].select).toEqual({
      id: true,
      code: true,
      name: true,
      system: true,
    });
  });

  it('puts the built-in profiles first, then sorts by name', async () => {
    const { controller, findMany } = setup();
    await controller.list();

    expect(findMany.mock.calls[0][0].orderBy).toEqual([{ system: 'desc' }, { name: 'asc' }]);
  });
});
