import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Paginated, PaginationQuery } from '@dontpanic/shared';
import { TenantContext } from '../../infra/tenancy/tenant-context';
import { paginate, paginationArgs } from './serialization';

/**
 * Tenant-scoped CRUD: the paginated, searchable, soft-deleting shape that every
 * feature module ends up writing by hand.
 *
 * Isolation is guaranteed here by construction: the `tenantId` always comes
 * from `TenantContext.requireTenantId()` — never from the caller, never from
 * the request body — and reads always filter `deletedAt: null`. Postgres Row
 * Level Security is the hard guarantee; this filter is the second layer, and
 * the one that lets the indexes do their job.
 */

/**
 * The structural subset of a Prisma delegate this helper uses. The generated
 * delegates have generic signatures that will not bind to a generic of ours;
 * this minimal contract avoids `any` and keeps the helper reusable. The shape
 * of `data` stays checked in the services, where each object is annotated with
 * the matching `Prisma.*UncheckedCreateInput`.
 */
export interface CrudDelegate<Row> {
  count(args: { where: Record<string, unknown> }): Promise<number>;
  findMany(args: Record<string, unknown>): Promise<Row[]>;
  findFirst(args: Record<string, unknown>): Promise<Row | null>;
  create(args: Record<string, unknown>): Promise<Row>;
  update(args: Record<string, unknown>): Promise<Row>;
}

/** Read `where`: always the tenant in context, always without deleted rows. */
export function tenantWhere(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { tenantId: TenantContext.requireTenantId(), deletedAt: null, ...extra };
}

/** Free-text search, case-insensitive, across the named fields. */
export function searchWhere(
  search: string | undefined,
  fields: readonly string[],
): Record<string, unknown> {
  if (!search || fields.length === 0) {
    return {};
  }
  return { OR: fields.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) };
}

/**
 * A unique-index violation, optionally from one specific index.
 *
 * Two paths, because there are two kinds of index. Ones Prisma knows about
 * surface as `P2002` with the offending fields in `meta.target`. Partial
 * indexes created by a migration (`… WHERE "deletedAt" IS NULL`) are invisible
 * to the Prisma client, so their failure arrives raw from the driver with
 * nothing but the Postgres message — which does name the index.
 */
export function isUniqueViolation(error: unknown, indexName?: string): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    if (!indexName) return true;
    const target = error.meta?.target;
    const asText = Array.isArray(target) ? target.join(',') : String(target ?? '');
    return asText.includes(indexName) || error.message.includes(indexName);
  }
  if (indexName && error instanceof Error) {
    return error.message.includes(indexName);
  }
  return false;
}

export interface TenantCrudOptions<Row, Dto> {
  /** Resource name used in the error messages, e.g. `Product`. */
  label: string;
  searchFields: readonly string[];
  orderBy: Record<string, unknown> | Record<string, unknown>[];
  map: (row: Row) => Dto;
  include?: Record<string, unknown>;
}

/**
 * Paginated, searchable, soft-deleting CRUD over one tenant-scoped table.
 *
 * The delegate is resolved on every call because `prisma.db` returns the
 * transaction of the request in flight — caching it in the constructor would
 * pin the wrong transaction.
 */
export class TenantCrud<Row, Dto> {
  constructor(
    private readonly delegate: () => CrudDelegate<Row>,
    private readonly options: TenantCrudOptions<Row, Dto>,
  ) {}

  async list(
    query: PaginationQuery,
    filters: Record<string, unknown> = {},
  ): Promise<Paginated<Dto>> {
    const where = {
      ...tenantWhere(filters),
      ...searchWhere(query.search, this.options.searchFields),
    };
    const delegate = this.delegate();
    const total = await delegate.count({ where });
    const rows = await delegate.findMany({
      where,
      orderBy: this.options.orderBy,
      include: this.options.include,
      ...paginationArgs(query),
    });
    return paginate(
      rows.map((row) => this.options.map(row)),
      total,
      query,
    );
  }

  /** A row of the current tenant, or 404. It can never reach another company. */
  async findRow(id: string): Promise<Row> {
    const row = await this.delegate().findFirst({
      where: tenantWhere({ id }),
      include: this.options.include,
    });
    if (!row) {
      throw new NotFoundException(`${this.options.label} not found`);
    }
    return row;
  }

  async get(id: string): Promise<Dto> {
    return this.options.map(await this.findRow(id));
  }

  async create(data: Record<string, unknown>): Promise<Dto> {
    const row = await this.duplicateAware(() =>
      this.delegate().create({
        data: { ...data, tenantId: TenantContext.requireTenantId() },
        include: this.options.include,
      }),
    );
    return this.options.map(row);
  }

  async update(id: string, data: Record<string, unknown>): Promise<Dto> {
    // Confirm ownership before writing: without this, an id from another
    // company would only fail by RLS's good grace.
    await this.findRow(id);
    const row = await this.duplicateAware(() =>
      this.delegate().update({
        where: { id },
        data,
        include: this.options.include,
      }),
    );
    return this.options.map(row);
  }

  /** Deleting means stamping `deletedAt` — the history is never lost. */
  async remove(id: string): Promise<void> {
    await this.findRow(id);
    await this.delegate().update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /**
   * Tenant-scoped tables carry `@@unique([tenantId, …])` indexes on a code or a
   * name. Without this translation, saving a duplicate would come out as a 500
   * — a server error for what is, in fact, user input.
   */
  private async duplicateAware(write: () => Promise<Row>): Promise<Row> {
    try {
      return await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `A ${this.options.label.toLowerCase()} with those details already exists`,
        );
      }
      throw err;
    }
  }
}
