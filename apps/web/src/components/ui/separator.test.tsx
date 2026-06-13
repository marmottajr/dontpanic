import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from './separator';

describe('Separator', () => {
  it('renders a horizontal separator by default', () => {
    render(<Separator data-testid="sep" />);
    const sep = screen.getByTestId('sep');
    expect(sep).toBeInTheDocument();
    // decorative defaults to true -> role="none" and aria-hidden
    expect(sep).toHaveAttribute('data-orientation', 'horizontal');
    expect(sep).toHaveClass('h-px', 'w-full');
  });

  it('applies vertical orientation classes', () => {
    render(<Separator orientation="vertical" data-testid="sep" />);
    const sep = screen.getByTestId('sep');
    expect(sep).toHaveAttribute('data-orientation', 'vertical');
    expect(sep).toHaveClass('h-full', 'w-px');
  });

  it('exposes a semantic separator role when not decorative', () => {
    render(<Separator decorative={false} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('merges a custom className', () => {
    render(<Separator className="my-8" data-testid="sep" />);
    expect(screen.getByTestId('sep')).toHaveClass('my-8', 'shrink-0', 'bg-border');
  });
});
