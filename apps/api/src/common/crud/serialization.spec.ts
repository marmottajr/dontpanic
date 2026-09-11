import {
  fromLocalDate,
  paginate,
  paginationArgs,
  toDecimalString,
  toIsoString,
  toLocalDate,
} from './serialization';

describe('toDecimalString', () => {
  it('keeps the decimal as text, because a float would lose precision', () => {
    expect(toDecimalString({ toString: () => '1234.56' })).toBe('1234.56');
  });

  it('passes null and undefined through as null', () => {
    expect(toDecimalString(null)).toBeNull();
    expect(toDecimalString(undefined)).toBeNull();
  });
});

describe('toLocalDate', () => {
  it('renders a civil date as YYYY-MM-DD, with no time and no zone', () => {
    expect(toLocalDate(new Date('2026-03-14T00:00:00.000Z'))).toBe('2026-03-14');
  });

  it('reads the UTC components, so the day does not slip west of Greenwich', () => {
    // 23:30 UTC is still the 14th; using local components in a negative offset
    // would report the 13th.
    expect(toLocalDate(new Date('2026-03-14T23:30:00.000Z'))).toBe('2026-03-14');
  });

  it('passes null and undefined through as null', () => {
    expect(toLocalDate(null)).toBeNull();
    expect(toLocalDate(undefined)).toBeNull();
  });
});

describe('fromLocalDate', () => {
  it('parses YYYY-MM-DD at midnight UTC, without a timezone conversion', () => {
    expect(fromLocalDate('2026-03-14').toISOString()).toBe('2026-03-14T00:00:00.000Z');
  });

  it('round-trips with toLocalDate', () => {
    expect(toLocalDate(fromLocalDate('2026-12-31'))).toBe('2026-12-31');
  });
});

describe('toIsoString', () => {
  it('renders a timestamp in ISO 8601', () => {
    expect(toIsoString(new Date('2026-03-14T15:09:26.535Z'))).toBe('2026-03-14T15:09:26.535Z');
  });
});

describe('paginationArgs', () => {
  it('skips nothing on the first page', () => {
    expect(paginationArgs({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
  });

  it('skips the pages before the requested one', () => {
    expect(paginationArgs({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
  });
});

describe('paginate', () => {
  it('rounds the page count up, so a partial page still counts', () => {
    expect(paginate([1, 2], 21, { page: 1, limit: 20 })).toEqual({
      items: [1, 2],
      total: 21,
      page: 1,
      limit: 20,
      totalPages: 2,
    });
  });

  it('reports one page when there is nothing — never "page 1 of 0"', () => {
    expect(paginate([], 0, { page: 1, limit: 20 }).totalPages).toBe(1);
  });
});
