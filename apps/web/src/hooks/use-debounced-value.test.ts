import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedValue } from './use-debounced-value';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDebouncedValue', () => {
  it('starts on the value it was given', () => {
    const { result } = renderHook(() => useDebouncedValue('ana'));
    expect(result.current).toBe('ana');
  });

  it('only settles once the typing stops', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'an' });
    rerender({ value: 'ana' });
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');

    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe('ana');
  });

  it('honours a custom delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 50), {
      initialProps: { value: 1 },
    });
    rerender({ value: 2 });
    act(() => void vi.advanceTimersByTime(50));
    expect(result.current).toBe(2);
  });

  it('drops the pending timer when it unmounts', () => {
    const { unmount } = renderHook(() => useDebouncedValue('x'));
    unmount();
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
