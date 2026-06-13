export const locales = ['pt-BR', 'en-US'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'pt-BR';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Metadata for the flag-based language switcher. */
export const localeMeta: Record<Locale, { label: string; short: string; flag: string }> = {
  'pt-BR': { label: 'Português (Brasil)', short: 'PT', flag: '🇧🇷' },
  'en-US': { label: 'English (US)', short: 'EN', flag: '🇺🇸' },
};

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
