import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpInput } from './otp-input';

function Harness(props: { onComplete?: (v: string) => void; length?: number; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <OtpInput
      value={value}
      onChange={setValue}
      length={props.length ?? 6}
      onComplete={props.onComplete}
      disabled={props.disabled}
      autoFocus
    />
  );
}

describe('OtpInput', () => {
  it('renders one box per digit', () => {
    render(<Harness length={4} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
  });

  it('types digits, auto-advances and fires onComplete', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(boxes[0]);
    await user.keyboard('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(boxes[0].value).toBe('1');
    expect(boxes[5].value).toBe('6');
  });

  it('ignores non-numeric characters', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(boxes[0]);
    await user.keyboard('a1');
    expect(boxes[0].value).toBe('1');
  });

  it('supports pasting the whole code', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(boxes[0]);
    await user.paste('654321');
    expect(onComplete).toHaveBeenCalledWith('654321');
    expect(boxes[0].value).toBe('6');
  });

  it('clears on backspace and moves focus back when empty', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(boxes[0]);
    await user.keyboard('12');
    // box[2] is focused (empty) -> backspace moves back and clears box[1]
    await user.keyboard('{Backspace}');
    expect(boxes[1].value).toBe('');
    // box[1] now focused with content cleared; backspace again clears box[0] path
    await user.keyboard('{Backspace}');
    expect(boxes[0].value).toBe('');
  });

  it('navigates with arrow keys without crashing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const boxes = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(boxes[2]);
    await user.keyboard('{ArrowLeft}{ArrowRight}');
    expect(boxes).toHaveLength(6);
  });

  it('respects the disabled state', () => {
    render(<Harness disabled />);
    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).disabled).toBe(true);
  });
});
