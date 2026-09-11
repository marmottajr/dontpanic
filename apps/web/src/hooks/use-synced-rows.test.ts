import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSyncedRows } from './use-synced-rows';

interface Row {
  key: string;
  id: string;
  label: string;
}

const row = (id: string, label: string, key = `k-${Math.random()}`): Row => ({ key, id, label });

describe('useSyncedRows', () => {
  it('does not re-apply the rows the grid already started with', () => {
    const apply = vi.fn();
    renderHook(() => useSyncedRows([row('1', 'Cheese')], false, apply));
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies the server rows once the labels finally resolve', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ rows }: { rows: Row[] }) => useSyncedRows(rows, false, apply),
      { initialProps: { rows: [row('1', '1')] } },
    );

    const resolved = [row('1', 'Cheese')];
    rerender({ rows: resolved });
    expect(apply).toHaveBeenCalledWith(resolved);
  });

  it('ignores a changed key — it would resync in an endless loop', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ rows }: { rows: Row[] }) => useSyncedRows(rows, false, apply),
      { initialProps: { rows: [row('1', 'Cheese', 'k-1')] } },
    );

    rerender({ rows: [row('1', 'Cheese', 'k-2')] });
    expect(apply).not.toHaveBeenCalled();
  });

  it('never overwrites what the user has already typed', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ rows, dirty }: { rows: Row[]; dirty: boolean }) => useSyncedRows(rows, dirty, apply),
      { initialProps: { rows: [row('1', '1')], dirty: true } },
    );

    rerender({ rows: [row('1', 'Cheese')], dirty: true });
    expect(apply).not.toHaveBeenCalled();
  });

  it('picks the sync back up once the grid is clean again', () => {
    const apply = vi.fn();
    const { rerender } = renderHook(
      ({ rows, dirty }: { rows: Row[]; dirty: boolean }) => useSyncedRows(rows, dirty, apply),
      { initialProps: { rows: [row('1', '1')], dirty: true } },
    );

    const resolved = [row('1', 'Cheese')];
    rerender({ rows: resolved, dirty: true });
    rerender({ rows: resolved, dirty: false });
    expect(apply).toHaveBeenCalledWith(resolved);
  });

  it('always calls the latest apply', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ rows, apply }: { rows: Row[]; apply: (rows: Row[]) => void }) =>
        useSyncedRows(rows, false, apply),
      { initialProps: { rows: [row('1', '1')], apply: first } },
    );

    rerender({ rows: [row('1', 'Cheese')], apply: second });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
