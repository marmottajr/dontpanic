'use client';

import * as React from 'react';

/**
 * Keeps a grid in sync with the server **for as long as nobody has edited it**.
 *
 * The labels of referenced records are resolved from lookups that arrive on a
 * separate query, almost always *after* the grid's first render. Because the
 * rows live in `useState`, what got captured at start-up was the row with the
 * label still unresolved — and it stayed that way forever. That is how a grid
 * ends up showing UUIDs instead of names.
 *
 * From the first edit on, the user is in charge: a refetch mid-typing must
 * never wipe out what they wrote.
 */
export function useSyncedRows<T extends { key: string }>(
  initialRows: T[],
  dirty: boolean,
  apply: (rows: T[]) => void,
): void {
  const signature = rowsSignature(initialRows);
  // The grid already started with these rows; only what comes later matters.
  const applied = React.useRef(signature);
  const latest = React.useRef({ initialRows, apply });
  latest.current = { initialRows, apply };

  React.useEffect(() => {
    if (dirty || applied.current === signature) return;
    applied.current = signature;
    latest.current.apply(latest.current.initialRows);
  }, [signature, dirty]);
}

/**
 * Each row's `key` comes from a counter and changes on every render, so it
 * cannot take part in the comparison — it would, and the grid would resync in
 * an endless loop.
 */
function rowsSignature(rows: Array<Record<string, unknown>>): string {
  return JSON.stringify(rows.map(({ key: _key, ...rest }) => rest));
}
