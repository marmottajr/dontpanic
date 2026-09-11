import { describe, it, expect } from 'vitest';
import {
  daysSince,
  displayPhone,
  displayPostalCode,
  displayTaxId,
  formatCurrency,
  formatDateTime,
  formatDayMonth,
  formatLocalDate,
  formatPercent,
} from './br-format';

/** Intl spacing varies between ICU versions; compare without it. */
const flat = (value: string) => value.replace(/\s/g, ' ');

describe('br-format', () => {
  it('formats documents, phones and postal codes, and tolerates the empty case', () => {
    expect(displayTaxId('52998224725')).toBe('529.982.247-25');
    expect(displayTaxId('11222333000181')).toBe('11.222.333/0001-81');
    expect(displayTaxId(null)).toBe('');
    expect(displayTaxId(undefined)).toBe('');

    expect(displayPhone('11987654321')).toBe('(11) 98765-4321');
    expect(displayPhone('1134567890')).toBe('(11) 3456-7890');
    expect(displayPhone(null)).toBe('');

    expect(displayPostalCode('01310100')).toBe('01310-100');
    expect(displayPostalCode(null)).toBe('');
  });

  it('formats currency from text, a number or nothing at all', () => {
    expect(flat(formatCurrency('1234.5'))).toBe('R$ 1.234,50');
    expect(flat(formatCurrency(10))).toBe('R$ 10,00');
    expect(flat(formatCurrency(null))).toBe('R$ 0,00');
    expect(flat(formatCurrency('not a number'))).toBe('R$ 0,00');
    expect(flat(formatCurrency('1234.5', 'en-US'))).toBe('R$1,234.50');
  });

  it('formats percentages and marks what is missing', () => {
    expect(formatPercent('12.5')).toBe('12,5%');
    expect(formatPercent(10)).toBe('10%');
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
    expect(formatPercent('')).toBe('—');
    expect(formatPercent('abc')).toBe('—');
  });

  it('treats a calendar date as a date, without dragging the timezone in', () => {
    expect(formatLocalDate('2026-03-15')).toBe('15/03/2026');
    expect(formatLocalDate('2026-03-15T23:00:00.000Z')).toBe('15/03/2026');
    expect(formatLocalDate(null)).toBe('—');
    expect(formatLocalDate('no date')).toBe('no date');
  });

  it('formats instants with the time of day', () => {
    const formatted = formatDateTime('2026-03-15T14:30:00.000Z');
    expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not a date')).toBe('not a date');
  });

  it('shows day/month and adds the year only when there is one', () => {
    expect(formatDayMonth(5, 9)).toBe('05/09');
    expect(formatDayMonth(5, 9, 1998)).toBe('05/09/1998');
    expect(formatDayMonth(15, 12, null)).toBe('15/12');
  });

  it('counts idle days without going negative', () => {
    const now = new Date('2026-03-15T12:00:00.000Z');
    expect(daysSince('2026-03-05T12:00:00.000Z', now)).toBe(10);
    expect(daysSince('2026-03-20T12:00:00.000Z', now)).toBe(0);
    expect(daysSince(null, now)).toBe(0);
    expect(daysSince('not a date', now)).toBe(0);
    expect(daysSince('2026-03-14T12:00:00.000Z')).toBeGreaterThanOrEqual(0);
  });
});
