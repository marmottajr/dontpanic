import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageHeader, Pagination, Toolbar } from './record-page';

describe('PageHeader', () => {
  it('shows title, subtitle and actions', () => {
    render(
      <PageHeader
        title="Customers"
        subtitle="142 records"
        actions={<button type="button">New</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByText('142 records')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  it('drops subtitle and actions when they are not given', () => {
    render(<PageHeader title="Customers" />);
    expect(screen.getByRole('heading', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Toolbar', () => {
  it('renders its children', () => {
    render(
      <Toolbar>
        <input aria-label="Search" />
      </Toolbar>,
    );
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });
});

describe('Pagination', () => {
  const props = {
    page: 2,
    totalPages: 3,
    total: 57,
    pageLabel: 'Page 2 of 3',
    totalLabel: '57 records',
    prevLabel: 'Previous',
    nextLabel: 'Next',
    onPageChange: vi.fn(),
  };

  it('steps back and forward', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination {...props} onPageChange={onPageChange} />);

    expect(screen.getByText('57 records · Page 2 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('disables the step that would run off either end', () => {
    const { rerender } = render(<Pagination {...props} page={1} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

    rerender(<Pagination {...props} page={3} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('keeps only the counter when everything fits on one page', () => {
    render(<Pagination {...props} page={1} totalPages={1} total={4} totalLabel="4 records" />);
    expect(screen.getByText('4 records')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('disappears entirely when there is nothing to page through', () => {
    const { container } = render(<Pagination {...props} total={0} totalPages={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
