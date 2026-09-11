import { describe, it, expect } from 'vitest';
import { daysUntil, formatPhone, formatPostalCode, formatTaxId, slugify, taxIdKind } from './masks';

describe('formatTaxId', () => {
  it('masks a CPF progressively', () => {
    expect(formatTaxId('')).toBe('');
    expect(formatTaxId('123')).toBe('123');
    expect(formatTaxId('1234')).toBe('123.4');
    expect(formatTaxId('1234567')).toBe('123.456.7');
    expect(formatTaxId('1234567890')).toBe('123.456.789-0');
    expect(formatTaxId('12345678901')).toBe('123.456.789-01');
  });

  it('switches to the CNPJ mask past 11 digits', () => {
    expect(formatTaxId('123456789012')).toBe('12.345.678/9012');
    expect(formatTaxId('12345678901234')).toBe('12.345.678/9012-34');
  });

  it('ignores non-digits and truncates beyond 14 digits', () => {
    expect(formatTaxId('12.345.678/9012-34')).toBe('12.345.678/9012-34');
    expect(formatTaxId('123456789012345678')).toBe('12.345.678/9012-34');
  });
});

describe('taxIdKind', () => {
  it('labels by length, and nothing while incomplete', () => {
    expect(taxIdKind('123.456.789-01')).toBe('CPF');
    expect(taxIdKind('12.345.678/9012-34')).toBe('CNPJ');
    expect(taxIdKind('1234')).toBeNull();
  });
});

describe('formatPhone', () => {
  it('masks landline and mobile numbers', () => {
    expect(formatPhone('')).toBe('');
    expect(formatPhone('11')).toBe('11');
    expect(formatPhone('1134')).toBe('(11) 34');
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890');
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321');
  });

  it('truncates beyond 11 digits', () => {
    expect(formatPhone('(11) 98765-43210')).toBe('(11) 98765-4321');
  });
});

describe('formatPostalCode', () => {
  it('masks a CEP progressively', () => {
    expect(formatPostalCode('013')).toBe('013');
    expect(formatPostalCode('01310')).toBe('01310');
    expect(formatPostalCode('01310100')).toBe('01310-100');
    expect(formatPostalCode('013101009999')).toBe('01310-100');
  });
});

describe('slugify', () => {
  it('strips accents, lowercases and hyphenates', () => {
    expect(slugify('Buffet São João')).toBe('buffet-sao-joao');
    expect(slugify('  Açaí & Cia.  ')).toBe('acai-cia');
    expect(slugify('---')).toBe('');
  });

  it('caps at 40 characters without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(38) + ' bcdef');
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('daysUntil', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('counts whole days ahead', () => {
    expect(daysUntil('2026-01-08T00:00:00.000Z', now)).toBe(7);
    expect(daysUntil('2026-01-01T06:00:00.000Z', now)).toBe(1);
  });

  it('returns 0 for missing, invalid or past dates', () => {
    expect(daysUntil(null, now)).toBe(0);
    expect(daysUntil(undefined, now)).toBe(0);
    expect(daysUntil('not-a-date', now)).toBe(0);
    expect(daysUntil('2025-12-31T00:00:00.000Z', now)).toBe(0);
  });

  it('defaults to the current clock', () => {
    expect(daysUntil(new Date(Date.now() + 86_400_000).toISOString())).toBe(1);
  });
});
