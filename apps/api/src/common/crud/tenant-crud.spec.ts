import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../infra/tenancy/tenant-context';
import {
  isUniqueViolation,
  searchWhere,
  tenantWhere,
  TenantCrud,
  type CrudDelegate,
  type TenantCrudOptions,
} from './tenant-crud';

interface Row {
  id: string;
  name: string;
}

const TENANT = 'tenant-1';

const inTenant = <T>(fn: () => Promise<T>): Promise<T> =>
  TenantContext.run({ scope: { kind: 'tenant', tenantId: TENANT } }, fn);

function makeDelegate(overrides: Partial<CrudDelegate<Row>> = {}): CrudDelegate<Row> {
  return {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Widget' }),
    create: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Widget' }),
    update: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Widget' }),
    ...overrides,
  } as CrudDelegate<Row>;
}

function makeOptions(
  overrides: Partial<TenantCrudOptions<Row, Row>> = {},
): TenantCrudOptions<Row, Row> {
  return {
    label: 'Product',
    searchFields: ['name'],
    orderBy: { name: 'asc' },
    map: (row) => row,
    ...overrides,
  };
}

function makeCrud(
  delegate: CrudDelegate<Row>,
  options: Partial<TenantCrudOptions<Row, Row>> = {},
): TenantCrud<Row, Row> {
  return new TenantCrud<Row, Row>(() => delegate, makeOptions(options));
}

const uniqueViolation = (
  target: unknown = ['tenantId', 'code'],
  message = 'Unique constraint failed',
) =>
  new Prisma.PrismaClientKnownRequestError(message, {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });

describe('tenantWhere', () => {
  it('takes the tenant from the context and hides deleted rows', async () => {
    await inTenant(async () => {
      expect(tenantWhere()).toEqual({ tenantId: TENANT, deletedAt: null });
    });
  });

  it('merges the caller filters on top, without letting them be the only filter', async () => {
    await inTenant(async () => {
      expect(tenantWhere({ active: true })).toEqual({
        tenantId: TENANT,
        deletedAt: null,
        active: true,
      });
    });
  });

  it('refuses to build a where clause outside a tenant scope', () => {
    // A silent default here would be a cross-company data leak.
    expect(() => tenantWhere()).toThrow(/No tenant in context/);
  });
});

describe('searchWhere', () => {
  it('builds a case-insensitive OR across the named fields', () => {
    expect(searchWhere('wid', ['name', 'code'])).toEqual({
      OR: [
        { name: { contains: 'wid', mode: 'insensitive' } },
        { code: { contains: 'wid', mode: 'insensitive' } },
      ],
    });
  });

  it('filters nothing when there is no search term', () => {
    expect(searchWhere(undefined, ['name'])).toEqual({});
    expect(searchWhere('', ['name'])).toEqual({});
  });

  it('filters nothing when no field was declared searchable', () => {
    expect(searchWhere('wid', [])).toEqual({});
  });
});

describe('isUniqueViolation', () => {
  it('recognises any P2002 when no index is named', () => {
    expect(isUniqueViolation(uniqueViolation())).toBe(true);
  });

  it('matches the named index against the fields Prisma reports', () => {
    expect(isUniqueViolation(uniqueViolation(['tenantId', 'code']), 'code')).toBe(true);
    expect(isUniqueViolation(uniqueViolation(['tenantId', 'code']), 'email')).toBe(false);
  });

  it('matches a non-array target as well', () => {
    expect(isUniqueViolation(uniqueViolation('products_code_key'), 'products_code_key')).toBe(true);
  });

  it('falls back to the message when Prisma reports no target', () => {
    expect(
      isUniqueViolation(
        uniqueViolation(undefined, 'duplicate key products_code_idx'),
        'products_code_idx',
      ),
    ).toBe(true);
  });

  it('falls back to the message when the error carries no metadata at all', () => {
    const err = new Prisma.PrismaClientKnownRequestError('duplicate key products_code_idx', {
      code: 'P2002',
      clientVersion: 'test',
    });

    expect(isUniqueViolation(err, 'products_code_idx')).toBe(true);
  });

  it('recognises a partial index by name, which the Prisma client does not know about', () => {
    // `CREATE UNIQUE INDEX … WHERE "deletedAt" IS NULL` never reaches the
    // client's schema, so the driver error is all we get.
    const raw = new Error(
      'duplicate key value violates unique constraint "products_tenant_code_active_idx"',
    );
    expect(isUniqueViolation(raw, 'products_tenant_code_active_idx')).toBe(true);
    expect(isUniqueViolation(raw, 'other_idx')).toBe(false);
  });

  it('does not call an unrelated failure a duplicate', () => {
    expect(isUniqueViolation(new Error('connection lost'))).toBe(false);
    expect(isUniqueViolation('connection lost', 'products_code_idx')).toBe(false);
    expect(
      isUniqueViolation(
        new Prisma.PrismaClientKnownRequestError('FK failed', {
          code: 'P2003',
          clientVersion: 'test',
        }),
      ),
    ).toBe(false);
  });
});

describe('TenantCrud.list', () => {
  it('scopes, searches and paginates in one query', async () => {
    const delegate = makeDelegate({
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([{ id: 'r-1', name: 'Widget' }]),
    });
    const crud = makeCrud(delegate, { include: { parts: true } });

    const page = await inTenant(() =>
      crud.list({ page: 2, limit: 2, search: 'wid' }, { active: true }),
    );

    expect(page).toEqual({
      items: [{ id: 'r-1', name: 'Widget' }],
      total: 3,
      page: 2,
      limit: 2,
      totalPages: 2,
    });
    expect(delegate.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        deletedAt: null,
        active: true,
        OR: [{ name: { contains: 'wid', mode: 'insensitive' } }],
      },
      orderBy: { name: 'asc' },
      include: { parts: true },
      skip: 2,
      take: 2,
    });
  });

  it('maps every row through the DTO mapper', async () => {
    const delegate = makeDelegate({
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([{ id: 'r-1', name: 'Widget' }]),
    });
    const crud = new TenantCrud<Row, { label: string }>(() => delegate, {
      ...makeOptions(),
      map: (row: Row) => ({ label: row.name }),
    });

    const page = await inTenant(() => crud.list({ page: 1, limit: 20 }));

    expect(page.items).toEqual([{ label: 'Widget' }]);
  });

  it('resolves the delegate per call, so it never pins a finished transaction', async () => {
    const first = makeDelegate({ count: jest.fn().mockResolvedValue(0) });
    const second = makeDelegate({ count: jest.fn().mockResolvedValue(0) });
    let current = first;
    const crud = new TenantCrud<Row, Row>(() => current, makeOptions());

    await inTenant(() => crud.list({ page: 1, limit: 20 }));
    current = second;
    await inTenant(() => crud.list({ page: 1, limit: 20 }));

    expect(first.count).toHaveBeenCalledTimes(1);
    expect(second.count).toHaveBeenCalledTimes(1);
  });
});

describe('TenantCrud.get', () => {
  it('reads a row of the current tenant only', async () => {
    const delegate = makeDelegate();
    const crud = makeCrud(delegate);

    await expect(inTenant(() => crud.get('r-1'))).resolves.toEqual({ id: 'r-1', name: 'Widget' });
    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, deletedAt: null, id: 'r-1' },
      include: undefined,
    });
  });

  it('answers 404 — never "forbidden" — for an id of another company', async () => {
    // Confirming that the id exists elsewhere would itself leak information.
    const crud = makeCrud(makeDelegate({ findFirst: jest.fn().mockResolvedValue(null) }));

    await expect(inTenant(() => crud.get('r-9'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(inTenant(() => crud.get('r-9'))).rejects.toThrow('Product not found');
  });
});

describe('TenantCrud.create', () => {
  it('stamps the tenant from the context, never from the payload', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'r-1', name: 'Widget' });
    const crud = makeCrud(makeDelegate({ create }));

    await expect(
      inTenant(() => crud.create({ name: 'Widget', tenantId: 'someone-elses-tenant' })),
    ).resolves.toEqual({ id: 'r-1', name: 'Widget' });
    expect(create.mock.calls[0][0].data.tenantId).toBe(TENANT);
  });

  it('turns a unique-index violation into a 409, not a 500', async () => {
    const crud = makeCrud(makeDelegate({ create: jest.fn().mockRejectedValue(uniqueViolation()) }));

    await expect(inTenant(() => crud.create({ code: 'KG' }))).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(inTenant(() => crud.create({ code: 'KG' }))).rejects.toThrow(
      'A product with those details already exists',
    );
  });

  it('does not disguise any other database failure as a conflict', async () => {
    const crud = makeCrud(
      makeDelegate({ create: jest.fn().mockRejectedValue(new Error('connection lost')) }),
    );

    await expect(inTenant(() => crud.create({ code: 'KG' }))).rejects.toThrow('connection lost');
  });
});

describe('TenantCrud.update', () => {
  it('checks ownership before writing', async () => {
    const order: string[] = [];
    const delegate = makeDelegate({
      findFirst: jest.fn(async () => {
        order.push('read');
        return { id: 'r-1', name: 'Widget' };
      }),
      update: jest.fn(async () => {
        order.push('write');
        return { id: 'r-1', name: 'Gadget' };
      }),
    });
    const crud = makeCrud(delegate);

    await expect(inTenant(() => crud.update('r-1', { name: 'Gadget' }))).resolves.toEqual({
      id: 'r-1',
      name: 'Gadget',
    });
    expect(order).toEqual(['read', 'write']);
  });

  it('refuses an id that does not belong to the tenant', async () => {
    const update = jest.fn();
    const crud = makeCrud(makeDelegate({ findFirst: jest.fn().mockResolvedValue(null), update }));

    await expect(inTenant(() => crud.update('r-9', { name: 'x' }))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('turns a unique-index violation on update into a 409 as well', async () => {
    const crud = makeCrud(makeDelegate({ update: jest.fn().mockRejectedValue(uniqueViolation()) }));

    await expect(inTenant(() => crud.update('r-1', { code: 'KG' }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('TenantCrud.remove', () => {
  it('soft-deletes: it stamps deletedAt instead of dropping the row', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'r-1', name: 'Widget' });
    const crud = makeCrud(makeDelegate({ update }));

    await expect(inTenant(() => crud.remove('r-1'))).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('refuses an id that does not belong to the tenant', async () => {
    const update = jest.fn();
    const crud = makeCrud(makeDelegate({ findFirst: jest.fn().mockResolvedValue(null), update }));

    await expect(inTenant(() => crud.remove('r-9'))).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });
});
