import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';
import { parseClipboardMatrix, useGridKeyboard } from './use-grid-keyboard';

/** A two-column grid, the smallest thing that exercises the real hook. */
function Grid({ columns = 2, onAdd }: { columns?: number; onAdd?: (index: number) => void }) {
  const [rows, setRows] = React.useState(['a', 'b']);
  const grid = useGridKeyboard({
    rowCount: rows.length,
    columnCount: columns,
    addRow: () => {
      const index = rows.length;
      setRows((current) => [...current, `row-${index}`]);
      onAdd?.(index);
      return index;
    },
  });

  return (
    <table>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={row}>
            {Array.from({ length: columns }, (_, column) => (
              <td key={column}>
                {column === 1 ? (
                  <select
                    aria-label={`${row}-${column}`}
                    ref={grid.register(rowIndex, column)}
                    onKeyDown={(event) => grid.handleKeyDown(event, rowIndex, column)}
                  >
                    <option>one</option>
                    <option>two</option>
                  </select>
                ) : (
                  <input
                    aria-label={`${row}-${column}`}
                    defaultValue={row}
                    ref={grid.register(rowIndex, column)}
                    onKeyDown={(event) => grid.handleKeyDown(event, rowIndex, column)}
                  />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe('useGridKeyboard', () => {
  it('walks down the column with Enter and back up with Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<Grid />);

    screen.getByLabelText('a-0').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('b-0')).toHaveFocus();

    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(screen.getByLabelText('a-0')).toHaveFocus();
  });

  it('stays put on Shift+Enter in the first row', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    screen.getByLabelText('a-0').focus();
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(screen.getByLabelText('a-0')).toHaveFocus();
  });

  it('appends a row when Enter runs off the bottom, and lands in it', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Grid onAdd={onAdd} />);

    screen.getByLabelText('b-0').focus();
    await user.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledWith(2);
    expect(screen.getByLabelText('row-2-0')).toHaveFocus();
  });

  it('appends a row when Tab runs off the last cell, back at column zero', async () => {
    const user = userEvent.setup();
    render(<Grid />);

    screen.getByLabelText('b-1').focus();
    await user.keyboard('{Tab}');
    expect(screen.getByLabelText('row-2-0')).toHaveFocus();
  });

  it('leaves Tab alone anywhere else', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    screen.getByLabelText('a-0').focus();
    await user.keyboard('{Tab}');
    expect(screen.getByLabelText('a-1')).toHaveFocus();
  });

  it('leaves Shift+Tab on the last cell alone', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    screen.getByLabelText('b-1').focus();
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByLabelText('b-0')).toHaveFocus();
  });

  it('moves along the column with the arrows, and stops at the edges', async () => {
    const user = userEvent.setup();
    render(<Grid />);

    screen.getByLabelText('a-0').focus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByLabelText('a-0')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByLabelText('b-0')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByLabelText('b-0')).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByLabelText('a-0')).toHaveFocus();
  });

  it('leaves the arrows to a select, where they pick the option', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    const select = screen.getByLabelText('a-1');
    select.focus();
    await user.keyboard('{ArrowDown}');
    expect(select).toHaveFocus();
  });

  it('ignores a key it does not own', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    const cell = screen.getByLabelText('a-0');
    cell.focus();
    await user.keyboard('x');
    expect(cell).toHaveFocus();
  });

  it('selects the text of the cell it lands on, ready to be overwritten', async () => {
    const user = userEvent.setup();
    render(<Grid />);
    screen.getByLabelText('a-0').focus();
    await user.keyboard('{Enter}');
    const landed = screen.getByLabelText('b-0') as HTMLInputElement;
    expect(landed.selectionStart).toBe(0);
    expect(landed.selectionEnd).toBe('b'.length);
  });

  it('forgets a cell that leaves the DOM', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Grid columns={2} />);
    rerender(<Grid columns={1} />);
    screen.getByLabelText('a-0').focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('b-0')).toHaveFocus();
  });
});

describe('parseClipboardMatrix', () => {
  it('turns pasted spreadsheet text into a matrix', () => {
    expect(parseClipboardMatrix('a\tb\r\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('drops blank lines, including a trailing newline', () => {
    expect(parseClipboardMatrix('a\tb\n\n   \nc\td\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('gives an empty matrix for empty text', () => {
    expect(parseClipboardMatrix('')).toEqual([]);
  });
});
