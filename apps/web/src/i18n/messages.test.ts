import { describe, it, expect } from 'vitest';
import ptBR from '../../messages/pt-BR.json';
import enUS from '../../messages/en-US.json';

/** Recursively collect dot-paths of every leaf key in a messages object. */
function deepKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return deepKeys(v, path);
  });
}

describe('translation integrity', () => {
  const ptKeys = deepKeys(ptBR).sort();
  const enKeys = deepKeys(enUS).sort();

  it('pt-BR and en-US expose the exact same set of deep keys', () => {
    const onlyInPt = ptKeys.filter((k) => !enKeys.includes(k));
    const onlyInEn = enKeys.filter((k) => !ptKeys.includes(k));

    expect(onlyInPt, `keys present only in pt-BR: ${onlyInPt.join(', ')}`).toEqual([]);
    expect(onlyInEn, `keys present only in en-US: ${onlyInEn.join(', ')}`).toEqual([]);
    expect(ptKeys).toEqual(enKeys);
  });

  it('has no empty string translations in either locale', () => {
    const empties = (obj: unknown, keys: string[]): string[] =>
      keys.filter((k) => {
        const value = k.split('.').reduce<unknown>((acc, part) => {
          return acc && typeof acc === 'object'
            ? (acc as Record<string, unknown>)[part]
            : undefined;
        }, obj);
        return value === '';
      });

    expect(empties(ptBR, ptKeys)).toEqual([]);
    expect(empties(enUS, enKeys)).toEqual([]);
  });
});
