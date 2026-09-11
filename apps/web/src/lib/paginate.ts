import type { Paginated } from '@dontpanic/shared';
import { api } from './api';

/**
 * Walks every page of a listing and returns the rows joined together.
 *
 * Lookup lists feed the labels of grids and selects (a name instead of a UUID).
 * A single page of 100 — the most the contract accepts — left everything past
 * that number out, and what was left out showed up on screen as a raw id. Here
 * the ceiling is the business's, not the pagination's.
 */
export const FETCH_ALL_PAGE_SIZE = 100;
/** Safety net against a listing that never ends: 20 × 100 rows. */
export const MAX_PAGES = 20;

export async function fetchAllPages<T>(buildPath: (page: number) => string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const chunk = await api<Paginated<T>>(buildPath(page));
    items.push(...chunk.items);
    if (chunk.items.length === 0 || page >= chunk.totalPages) break;
  }
  return items;
}
