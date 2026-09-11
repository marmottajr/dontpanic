/**
 * Month-over-month variation — the arrow next to a headline number.
 *
 * The maths runs in `BigInt` over the digits of the two strings: money never
 * passes through `number`, not even to work out the percentage that describes
 * it. What comes out of here is already the indicator — percentage points, one
 * decimal place — and not a monetary value.
 */

export type VariationDirection = 'up' | 'down' | 'flat';

export interface Variation {
  direction: VariationDirection;
  /** Magnitude in percentage points, always positive: `'12.4'` = 12.4%. */
  percent: string;
}

interface Parsed {
  /** Value without the separator, sign included: `-12.34` → `-1234n`. */
  units: bigint;
  /** How many decimal places `units` represents. */
  scale: number;
}

const DECIMAL_RE = /^[+-]?\d*(\.\d*)?$/;

/**
 * `'12.340'` → `{ units: 12340n, scale: 3 }`, or `null` when it is not a
 * decimal. The API hands money over as a string (Postgres `Decimal` does not
 * fit in a JavaScript `number`), so parsing starts from the digits.
 */
function parseDecimal(value: string): Parsed | null {
  const text = value.trim();
  if (text === '' || text === '.' || text === '-' || text === '+') return null;
  if (!DECIMAL_RE.test(text)) return null;

  const negative = text.startsWith('-');
  const unsigned = text.replace(/^[+-]/, '');
  const [integer = '', fraction = ''] = unsigned.split('.');
  const digits = `${integer === '' ? '0' : integer}${fraction}`;
  const units = BigInt(digits);
  return { units: negative ? -units : units, scale: fraction.length };
}

/** Division rounding to nearest, halves away from zero. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const twiceRemainder = (remainder < 0n ? -remainder : remainder) * 2n;
  if (twiceRemainder < denominator) return quotient;
  return numerator < 0n ? quotient - 1n : quotient + 1n;
}

/**
 * `null` whenever no comparison is possible:
 *
 * - `previous` is `null` (the API says there is no history);
 * - `previous` is zero — "from 0 to 12,000" is not "+∞%", it is a month with no
 *   term of comparison, and an arrow carrying a made-up number would be worse
 *   than nothing at all.
 */
export function computeVariation(value: string, previous: string | null): Variation | null {
  if (previous === null) return null;

  const now = parseDecimal(value);
  const before = parseDecimal(previous);
  if (!now || !before) return null;

  // Line the scales up before subtracting: '1200' and '1200.50' hold the same
  // value in different units.
  const scale = Math.max(now.scale, before.scale);
  const lift = (parsed: Parsed): bigint => parsed.units * 10n ** BigInt(scale - parsed.scale);

  const current = lift(now);
  const base = lift(before);
  if (base === 0n) return null;

  const absoluteBase = base < 0n ? -base : base;
  // (current − previous) ÷ previous × 100, in tenths of a percentage point.
  const tenths = divideRounded((current - base) * 1000n, absoluteBase);
  const magnitude = tenths < 0n ? -tenths : tenths;

  return {
    direction: tenths > 0n ? 'up' : tenths < 0n ? 'down' : 'flat',
    percent: `${magnitude / 10n}.${magnitude % 10n}`,
  };
}

/**
 * `'15.5'` → `15,5%` in pt-BR, `15.5%` in en-US. A whole number drops the
 * decimal place, so a steady month reads `25%` and not `25.0%`.
 */
export function formatPercent(percent: string, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Number(percent),
  );
  return `${formatted}%`;
}
