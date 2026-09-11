'use client';

import * as React from 'react';

/**
 * Keyboard navigation for editable grids.
 *
 * An operator coming from the old system measures the product by how fast they
 * can enter forty rows: no modal per row. The rules, the same in every grid:
 *
 *  · `Tab` / `Shift+Tab` walk the cells in DOM order;
 *  · `Tab` on the last cell of the last row appends a row and jumps into it;
 *  · `Enter` moves down the column — at the bottom it appends a row;
 *    `Shift+Enter` moves up;
 *  · up/down arrows move along the column (except inside a `select`, where the
 *    arrows pick the option).
 */

export interface GridKeyboard {
  register: (row: number, column: number) => (element: HTMLElement | null) => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLElement>, row: number, column: number) => void;
  focusCell: (row: number, column: number) => void;
}

export interface GridKeyboardOptions {
  rowCount: number;
  columnCount: number;
  /** Appends a row after `after` (or at the end) and returns its index. */
  addRow: (after?: number) => number;
}

export function useGridKeyboard({
  rowCount,
  columnCount,
  addRow,
}: GridKeyboardOptions): GridKeyboard {
  const cells = React.useRef(new Map<string, HTMLElement>());
  const [target, setTarget] = React.useState<{ row: number; column: number } | null>(null);

  const key = (row: number, column: number) => `${row}:${column}`;

  const register = React.useCallback(
    (row: number, column: number) => (element: HTMLElement | null) => {
      if (element) cells.current.set(key(row, column), element);
      else cells.current.delete(key(row, column));
    },
    [],
  );

  // A row created from the keyboard only exists after the render; focus follows.
  React.useEffect(() => {
    if (!target) return;
    const element = cells.current.get(key(target.row, target.column));
    element?.focus();
    if (element instanceof HTMLInputElement) element.select();
    setTarget(null);
  }, [target]);

  const focusCell = React.useCallback(
    (row: number, column: number) => setTarget({ row, column }),
    [],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>, row: number, column: number) => {
    const lastRow = rowCount - 1;
    const lastColumn = columnCount - 1;

    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        if (row > 0) focusCell(row - 1, column);
        return;
      }
      focusCell(row === lastRow ? addRow(row) : row + 1, column);
      return;
    }

    if (event.key === 'Tab' && !event.shiftKey && row === lastRow && column === lastColumn) {
      event.preventDefault();
      focusCell(addRow(row), 0);
      return;
    }

    const isSelect = event.currentTarget instanceof HTMLSelectElement;
    if (isSelect) return;
    if (event.key === 'ArrowDown' && row < lastRow) {
      event.preventDefault();
      focusCell(row + 1, column);
    } else if (event.key === 'ArrowUp' && row > 0) {
      event.preventDefault();
      focusCell(row - 1, column);
    }
  };

  return { register, handleKeyDown, focusCell };
}

/** Text pasted from a spreadsheet → matrix of cells (TSV). */
export function parseClipboardMatrix(text: string): string[][] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.split('\t'));
}
