import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatDayLabel, formatMoney, formatNumber } from './format';

describe('platform formatting', () => {
  it('formats a date in the interface’s locale, not a fixed one', () => {
    const iso = '2026-03-09T15:04:05.000Z';
    expect(formatDate(iso, 'en-US')).not.toEqual(formatDate(iso, 'pt-BR'));
    expect(formatDate(iso, 'en-US')).toContain('2026');
  });

  it('returns null rather than a wrong date when there is nothing to format', () => {
    expect(formatDate(null, 'en-US')).toBeNull();
    expect(formatDate(undefined, 'en-US')).toBeNull();
    expect(formatDate('not a date', 'en-US')).toBeNull();
    expect(formatDateTime(null, 'en-US')).toBeNull();
    expect(formatDateTime('not a date', 'en-US')).toBeNull();
  });

  it('keeps the time of day when the time of day matters', () => {
    const formatted = formatDateTime('2026-03-09T15:04:00.000Z', 'en-US');
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it('turns cents into money, because cents is how the API stores it', () => {
    expect(formatMoney(12_900, 'USD', 'en-US')).toBe('$129.00');
    expect(formatMoney(0, 'USD', 'en-US')).toBe('$0.00');
  });

  it('formats plain numbers per locale', () => {
    expect(formatNumber(1234, 'en-US')).toBe('1,234');
  });

  it('labels a chart day, and falls back to the raw key when it is not a day', () => {
    expect(formatDayLabel('2026-03-09', 'en-US')).toMatch(/Mar/);
    expect(formatDayLabel('nonsense', 'en-US')).toBe('nonsense');
  });
});
