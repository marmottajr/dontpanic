import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('Input', () => {
  it('renders with a placeholder and the given type', () => {
    render(<Input type="email" placeholder="you@example.com" />);
    const input = screen.getByPlaceholderText('you@example.com') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'email');
  });

  it('reflects a controlled value', () => {
    render(<Input value="hello" onChange={() => {}} />);
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument();
  });

  it('accepts typed input and reports each change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Input placeholder="type here" onChange={onChange} />);
    const input = screen.getByPlaceholderText('type here');
    await user.type(input, 'abc');
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(input).toHaveValue('abc');
  });

  it('does not accept input when disabled', async () => {
    const user = userEvent.setup();
    render(<Input placeholder="locked" disabled />);
    const input = screen.getByPlaceholderText('locked');
    expect(input).toBeDisabled();
    await user.type(input, 'x');
    expect(input).toHaveValue('');
  });

  it('exposes aria-invalid for error styling', () => {
    render(<Input aria-invalid placeholder="bad" />);
    expect(screen.getByPlaceholderText('bad')).toHaveAttribute('aria-invalid', 'true');
  });
});
