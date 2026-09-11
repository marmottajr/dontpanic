import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Paginated } from '@dontpanic/shared';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...args: unknown[]) => apiMock(...args) }));

import { fetchAllPages, FETCH_ALL_PAGE_SIZE, MAX_PAGES } from './paginate';

/**
 * The contract caps every page at 100 rows. Without this helper a lookup list
 * larger than that left references unresolved and the screen showed a raw UUID
 * instead of a name — exactly the defect this file exists to prevent.
 */
const page = (ids: string[], totalPages: number, current: number): Paginated<{ id: string }> => ({
  items: ids.map((id) => ({ id })),
  total: totalPages * FETCH_ALL_PAGE_SIZE,
  page: current,
  limit: FETCH_ALL_PAGE_SIZE,
  totalPages,
});

describe('fetchAllPages', () => {
  beforeEach(() => apiMock.mockReset());

  it('joins every page, in order', async () => {
    apiMock
      .mockResolvedValueOnce(page(['a', 'b'], 3, 1))
      .mockResolvedValueOnce(page(['c'], 3, 2))
      .mockResolvedValueOnce(page(['d'], 3, 3));

    await expect(fetchAllPages<{ id: string }>((n) => `/things?page=${n}`)).resolves.toEqual([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
    ]);
    expect(apiMock.mock.calls.map(([path]) => path)).toEqual([
      '/things?page=1',
      '/things?page=2',
      '/things?page=3',
    ]);
  });

  it('stops at the first page when it is the only one', async () => {
    apiMock.mockResolvedValueOnce(page(['a'], 1, 1));
    await fetchAllPages((n) => `/x?page=${n}`);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('stops on an empty page, even when the total lies', async () => {
    apiMock.mockResolvedValueOnce(page([], 9, 1));
    await expect(fetchAllPages((n) => `/x?page=${n}`)).resolves.toEqual([]);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('never asks for more than MAX_PAGES pages', async () => {
    apiMock.mockResolvedValue(page(['a'], 999, 1));
    await fetchAllPages((n) => `/x?page=${n}`);
    expect(apiMock).toHaveBeenCalledTimes(MAX_PAGES);
  });
});
