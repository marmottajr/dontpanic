import { describe, it, expect } from 'vitest';
import { computeVariation, formatPercent } from './variation';

/**
 * The arrow next to a headline number. What is tested is what the owner reads:
 * the direction (up or down) and the magnitude — and, above all, the cases
 * where there is no comparison to make at all.
 */
describe('computeVariation', () => {
  it('measures a rise in percentage points', () => {
    expect(computeVariation('138600.00', '120000.00')).toEqual({
      direction: 'up',
      percent: '15.5',
    });
  });

  it('measures a fall with a positive magnitude — the sign lives in the direction', () => {
    expect(computeVariation('90000.00', '120000.00')).toEqual({
      direction: 'down',
      percent: '25.0',
    });
  });

  it('treats two equal months as flat', () => {
    expect(computeVariation('120000.00', '120000')).toEqual({ direction: 'flat', percent: '0.0' });
  });

  it('does not compare when there is no previous month', () => {
    expect(computeVariation('138600.00', null)).toBeNull();
  });

  it('never invents a percentage over a zero base', () => {
    expect(computeVariation('138600.00', '0.00')).toBeNull();
  });

  it('ignores values that are not decimals', () => {
    expect(computeVariation('', '120000.00')).toBeNull();
    expect(computeVariation('   ', '120000.00')).toBeNull();
    expect(computeVariation('.', '120000.00')).toBeNull();
    expect(computeVariation('-', '120000.00')).toBeNull();
    expect(computeVariation('+', '120000.00')).toBeNull();
    expect(computeVariation('138600.00', 'a lot')).toBeNull();
  });

  it('accepts an explicit sign and a bare fraction', () => {
    expect(computeVariation('+150', '100')).toEqual({ direction: 'up', percent: '50.0' });
    expect(computeVariation('.5', '1')).toEqual({ direction: 'down', percent: '50.0' });
  });

  it('measures against a negative base by its magnitude', () => {
    expect(computeVariation('-50.00', '-100.00')).toEqual({ direction: 'up', percent: '50.0' });
    expect(computeVariation('-150.00', '-100.00')).toEqual({ direction: 'down', percent: '50.0' });
  });

  it('rounds to the tenth of a point, with no floating point in sight', () => {
    // a third up: 33.333…% rounds to 33.3%
    expect(computeVariation('400.00', '300.00')).toEqual({ direction: 'up', percent: '33.3' });
    // two thirds: 66.666…% rounds up, to 66.7%
    expect(computeVariation('500.00', '300.00')).toEqual({ direction: 'up', percent: '66.7' });
    // and the same rounding on the way down, halves away from zero
    expect(computeVariation('200.00', '300.00')).toEqual({ direction: 'down', percent: '33.3' });
    expect(computeVariation('100.00', '300.00')).toEqual({ direction: 'down', percent: '66.7' });
  });

  it('lines up different scales before subtracting', () => {
    expect(computeVariation('1200.5000', '1200.50')).toEqual({ direction: 'flat', percent: '0.0' });
  });

  it('survives values that would not fit a number without losing exactness', () => {
    expect(computeVariation('20000000000000000000.00', '10000000000000000000.00')).toEqual({
      direction: 'up',
      percent: '100.0',
    });
  });
});

describe('formatPercent', () => {
  it('uses the locale separator and drops a trailing zero', () => {
    expect(formatPercent('15.5', 'pt-BR')).toBe('15,5%');
    expect(formatPercent('15.5', 'en-US')).toBe('15.5%');
    expect(formatPercent('25.0', 'pt-BR')).toBe('25%');
  });
});
