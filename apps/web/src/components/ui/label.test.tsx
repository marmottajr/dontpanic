import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Label } from './label';
import { Input } from './input';

describe('Label', () => {
  it('renders its text', () => {
    render(<Label>Email</Label>);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('associates with an input via htmlFor and focuses it on click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Label htmlFor="email-field">Email address</Label>
        <Input id="email-field" placeholder="email" />
      </div>,
    );
    // getByLabelText proves the htmlFor <-> id association works
    const input = screen.getByLabelText('Email address');
    expect(input).toBe(screen.getByPlaceholderText('email'));

    await user.click(screen.getByText('Email address'));
    expect(input).toHaveFocus();
  });
});
