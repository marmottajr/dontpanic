import { formatPhone, formatPostalCode, formatTaxId } from '@/lib/masks';

/**
 * Brazilian display helpers — an opt-in companion to `@/lib/masks`.
 *
 * The masks (document, phone, postal code) are shared with the forms; this
 * module only adds what is missing on read-only screens: currency, percentage,
 * dates and elapsed-day counters. DTOs bring these fields as `string | null`,
 * hence the null-tolerant wrappers.
 *
 * Same principle as the schemas: the database stores digits only, the UI is
 * where formatting happens.
 */

export const displayTaxId = (value: string | null | undefined): string =>
  value ? formatTaxId(value) : '';

export const displayPhone = (value: string | null | undefined): string =>
  value ? formatPhone(value) : '';

export const displayPostalCode = (value: string | null | undefined): string =>
  value ? formatPostalCode(value) : '';

/** Decimals travel as text so precision is not lost; only here do they become numbers. */
export function formatCurrency(
  value: string | number | null | undefined,
  locale = 'pt-BR',
): string {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  const amount = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(amount);
}

export function formatPercent(value: string | number | null | undefined, locale = 'pt-BR'): string {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(parsed)}%`;
}

/**
 * Calendar date `YYYY-MM-DD`. Parsed from the date slice and rebuilt in local
 * time on purpose: `new Date(iso)` would drag the timezone in and show the
 * previous day for anyone west of UTC.
 */
export function formatLocalDate(value: string | null | undefined, locale = 'pt-BR'): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(
    new Date(year, month - 1, day),
  );
}

/** ISO instant (activity, audit trail) — here the time of day does matter. */
export function formatDateTime(value: string | null | undefined, locale = 'pt-BR'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

/** Day/month (plus the original year, when known) for recurring dates. */
export function formatDayMonth(day: number, month: number, year?: number | null): string {
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return year ? `${dd}/${mm}/${year}` : `${dd}/${mm}`;
}

/** Whole days elapsed since an instant — the basis of "idle for N days". */
export function daysSince(value: string | null | undefined, now: Date = new Date()): number {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}
