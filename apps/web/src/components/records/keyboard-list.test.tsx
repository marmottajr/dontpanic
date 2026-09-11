import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardList, type RecordColumn, type KeyboardListLabels } from './keyboard-list';

interface Row {
  id: string;
  name: string;
  city: string;
}

const rows: Row[] = [
  { id: '1', name: 'Ana', city: 'Recife' },
  { id: '2', name: 'Bruno', city: 'Lisboa' },
  { id: '3', name: 'Carla', city: 'Porto' },
];

const columns: RecordColumn<Row>[] = [
  { id: 'name', header: 'Name', cell: (row) => row.name },
  { id: 'city', header: 'City', cell: (row) => row.city, className: 'text-right' },
];

const labels: KeyboardListLabels = {
  loading: 'Loading…',
  error: 'Could not load',
  retry: 'Try again',
  empty: 'Nothing here',
};

function setup(props: Partial<React.ComponentProps<typeof KeyboardList<Row>>> = {}) {
  return render(
    <KeyboardList<Row>
      items={rows}
      columns={columns}
      getKey={(row) => row.id}
      labels={labels}
      aria-label="Records"
      {...props}
    />,
  );
}

const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('KeyboardList', () => {
  it('renders the headers and one row per item', () => {
    setup();
    const table = screen.getByRole('table', { name: 'Records' });
    expect(within(table).getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('Recife')).toBeInTheDocument();
  });

  it('walks the rows with the arrows and jumps to the ends with Home/End', async () => {
    const user = userEvent.setup();
    setup();
    const [first, second, third] = bodyRows();

    first!.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
    await user.keyboard('{End}');
    expect(third).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
  });

  it('clamps the movement at both ends instead of wrapping around', async () => {
    const user = userEvent.setup();
    setup();
    const [first, , third] = bodyRows();

    first!.focus();
    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();

    third!.focus();
    await user.keyboard('{ArrowDown}');
    expect(third).toHaveFocus();
  });

  it('opens the focused row on Enter and on click', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    setup({ onOpen });

    bodyRows()[1]!.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(rows[1]);

    await user.click(screen.getByText('Recife'));
    expect(onOpen).toHaveBeenCalledWith(rows[0]);
    expect(bodyRows()[0]).toHaveClass('cursor-pointer');
  });

  it('ignores unrelated keys and Enter when there is nothing to open', async () => {
    const user = userEvent.setup();
    setup();
    const [first] = bodyRows();
    first!.focus();
    await user.keyboard('{Enter}x');
    expect(first).toHaveFocus();
  });

  it('leaves Enter inside a row button to the button', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    setup({
      onOpen,
      rowActions: (row) => (
        <button type="button" onClick={() => onDelete(row.id)}>
          Delete {row.name}
        </button>
      ),
      labels: { ...labels, actions: 'Actions' },
    });

    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    screen.getByRole('button', { name: 'Delete Ana' }).focus();
    await user.keyboard('{Enter}');
    expect(onDelete).toHaveBeenCalledWith('1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('renders an actions column with no header text when no label is given', () => {
    setup({ rowActions: () => <button type="button">Edit</button> });
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(3);
    expect(headers[2]).toHaveTextContent('');
  });

  it('shows the loading state instead of the rows', () => {
    setup({ isLoading: true });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('shows the error with a retry button that calls back', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    setup({ isError: true, onRetry });
    expect(screen.getByText('Could not load')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when there is nothing to retry with', () => {
    setup({ isError: true });
    expect(screen.getByText('Could not load')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows the empty state with its hint and call to action', () => {
    setup({
      items: [],
      labels: { ...labels, emptyHint: 'Create the first one.' },
      emptyAction: <button type="button">New record</button>,
    });
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Create the first one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New record' })).toBeInTheDocument();
  });

  it('keeps the empty state bare when no hint or action is given', () => {
    setup({ items: [] });
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the shortcut hint only when there are rows to use it on', () => {
    const { rerender } = setup({ labels: { ...labels, hint: 'Arrows to walk, Enter to open' } });
    expect(screen.getByText('Arrows to walk, Enter to open')).toBeInTheDocument();

    rerender(
      <KeyboardList<Row>
        items={[]}
        columns={columns}
        getKey={(row) => row.id}
        labels={{ ...labels, hint: 'Arrows to walk, Enter to open' }}
      />,
    );
    expect(screen.queryByText('Arrows to walk, Enter to open')).not.toBeInTheDocument();
  });

  it('flags a row through rowClassName', () => {
    setup({ rowClassName: (row) => (row.id === '2' ? 'opacity-60' : undefined) });
    expect(bodyRows()[1]).toHaveClass('opacity-60');
    expect(bodyRows()[0]).not.toHaveClass('opacity-60');
  });

  it('applies the column classes to header and cell', () => {
    setup({
      columns: [{ ...columns[0]!, headerClassName: 'w-40' }, columns[1]!],
    });
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveClass('w-40');
    expect(screen.getByText('Recife')).toHaveClass('text-right');
  });
});
