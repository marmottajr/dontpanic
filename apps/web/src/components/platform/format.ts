/**
 * Formatting for the platform panel. Everything takes the `locale` the
 * interface is in — pt-BR and en-US format dates, numbers and money
 * differently, and the panel may not assume either of them.
 */

export function formatDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Price arrives in cents, the way the API stores it. */
export function formatMoney(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Short label for an ISO day (YYYY-MM-DD) on a chart axis. */
export function formatDayLabel(day: string, locale: string): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(date);
}
