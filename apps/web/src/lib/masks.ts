import { onlyDigits } from '@dontpanic/shared/locale/br';

/**
 * Brazilian input masks — presentation only.
 *
 * Validation lives in `@dontpanic/shared/locale/br` and storage is always
 * digits only; these functions deal exclusively with how the value looks while
 * the user types. They are pure and progressive: they format whatever is there
 * without requiring the field to be complete.
 *
 * Like the schemas they pair with, this is an opt-in Brazilian module — the
 * boilerplate itself stays locale-neutral.
 */

/** `00000000000` → `000.000.000-00`; `00000000000000` → `00.000.000/0000-00`. */
export function formatTaxId(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);

  // Up to 11 digits we assume a CPF; past that, a CNPJ.
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

/** Document label based on length — CPF, CNPJ, or nothing yet. */
export function taxIdKind(value: string): 'CPF' | 'CNPJ' | null {
  const length = onlyDigits(value).length;
  if (length === 11) return 'CPF';
  if (length === 14) return 'CNPJ';
  return null;
}

/** `11987654321` → `(11) 98765-4321`; `1134567890` → `(11) 3456-7890`. */
export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  // Mobile (9 digits) splits 5+4; landline (8) splits 4+4.
  const split = rest.length > 8 ? 5 : 4;
  if (rest.length <= split) return `(${ddd}) ${rest}`;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** `01310100` → `01310-100`. */
export function formatPostalCode(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Suggests a URL-safe slug from a free-text name: accents stripped, lowercased,
 * letters, digits and hyphens only, capped at 40 characters and never ending in
 * a hyphen.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** Whole days left until `iso`; 0 when it is already past or there is no date. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return 0;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return 0;
  const diff = end - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / 86_400_000);
}
