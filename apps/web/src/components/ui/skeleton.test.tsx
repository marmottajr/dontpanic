import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders a pulsing placeholder div with base classes', () => {
    render(<Skeleton data-testid="sk" />);
    const sk = screen.getByTestId('sk');
    expect(sk.tagName).toBe('DIV');
    expect(sk).toHaveClass('animate-pulse', 'rounded-md', 'bg-muted');
  });

  it('merges a custom className and forwards arbitrary props', () => {
    render(<Skeleton className="h-4 w-32" aria-label="loading" data-testid="sk" />);
    const sk = screen.getByTestId('sk');
    expect(sk).toHaveClass('h-4', 'w-32', 'animate-pulse');
    expect(sk).toHaveAttribute('aria-label', 'loading');
  });
});
