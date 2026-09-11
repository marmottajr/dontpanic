import type { Paginated } from '@dontpanic/shared';

/**
 * Conversions between Prisma rows and the DTOs of the shared contract.
 *
 * Two rules hold everywhere:
 *  - a `Decimal` leaves as TEXT, never as `number` — going through a float
 *    loses precision, which is precisely what a decimal column is for;
 *  - civil dates (`@db.Date`) travel as `YYYY-MM-DD`, with no time and no zone.
 */

/** A Prisma decimal value — all we need from it is `toString`. */
export interface DecimalLike {
  toString(): string;
}

export function toDecimalString(value: DecimalLike | null | undefined): string | null {
  return value == null ? null : value.toString();
}

/**
 * A `@db.Date` arrives as a `Date` at midnight UTC. We read the UTC components
 * on purpose: using the local ones would shift the date by a day for anyone
 * west of Greenwich.
 */
export function toLocalDate(value: Date | null | undefined): string | null {
  return value == null ? null : value.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` → `Date` at midnight UTC, with no timezone conversion. */
export function fromLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toIsoString(value: Date): string {
  return value.toISOString();
}

/** `skip`/`take` for a page of a Prisma query. */
export function paginationArgs(query: { page: number; limit: number }): {
  skip: number;
  take: number;
} {
  return { skip: (query.page - 1) * query.limit, take: query.limit };
}

/** Wraps a page of items in the contract's pagination envelope. */
export function paginate<T>(
  items: T[],
  total: number,
  query: { page: number; limit: number },
): Paginated<T> {
  return {
    items,
    total,
    page: query.page,
    limit: query.limit,
    // An empty list is still one (empty) page — never zero, which would make
    // "page 1 of 0" show up in the UI.
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}
