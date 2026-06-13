import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Switch } from './switch';

function Controlled() {
  const [on, setOn] = useState(false);
  return (
    <>
      <Switch checked={on} onCheckedChange={setOn} aria-label="Notifications" />
      <span data-testid="state">{on ? 'on' : 'off'}</span>
    </>
  );
}

describe('Switch', () => {
  it('renders with the switch role and starts unchecked', () => {
    render(<Switch aria-label="Wifi" />);
    const sw = screen.getByRole('switch', { name: 'Wifi' });
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles state and calls onCheckedChange when clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch aria-label="Toggle" onCheckedChange={onChange} />);
    const sw = screen.getByRole('switch');
    await user.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects the new state when controlled', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const sw = screen.getByRole('switch', { name: 'Notifications' });
    expect(screen.getByTestId('state')).toHaveTextContent('off');
    await user.click(sw);
    expect(screen.getByTestId('state')).toHaveTextContent('on');
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Switch aria-label="Locked" disabled onCheckedChange={onChange} />);
    await user.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
