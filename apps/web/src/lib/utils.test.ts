import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges multiple class strings', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('dedupes conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('drops falsy/conditional values', () => {
    expect(cn('text-sm', false && 'hidden', undefined, null, 'font-bold')).toBe(
      'text-sm font-bold',
    );
  });
});
