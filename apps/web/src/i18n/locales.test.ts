import { describe, it, expect } from 'vitest';
import { locales, defaultLocale, localeMeta, isLocale, LOCALE_COOKIE } from './locales';

describe('locales', () => {
  it('exposes the supported locales and a sane default', () => {
    expect(locales).toEqual(['pt-BR', 'en-US']);
    expect(locales).toContain(defaultLocale);
    expect(LOCALE_COOKIE).toBe('NEXT_LOCALE');
  });

  it('has switcher metadata for every supported locale', () => {
    for (const loc of locales) {
      expect(localeMeta[loc]).toMatchObject({
        label: expect.any(String),
        short: expect.any(String),
        flag: expect.any(String),
      });
    }
  });

  it('isLocale accepts only supported locale strings', () => {
    expect(isLocale('pt-BR')).toBe(true);
    expect(isLocale('en-US')).toBe(true);
  });

  it('isLocale rejects unknown, empty and undefined values', () => {
    expect(isLocale('fr-FR')).toBe(false);
    expect(isLocale('en')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
