import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariants } from './badge';

describe('Badge', () => {
  it('renders its content as a span by default', () => {
    render(<Badge>New</Badge>);
    const badge = screen.getByText('New');
    expect(badge).toBeInTheDocument();
    expect(badge.tagName).toBe('SPAN');
  });

  it('applies the default variant classes', () => {
    render(<Badge>Def</Badge>);
    expect(screen.getByText('Def')).toHaveClass('bg-primary/15');
  });

  it('covers every variant branch', () => {
    expect(badgeVariants({ variant: 'default' })).toContain('bg-primary/15');
    expect(badgeVariants({ variant: 'secondary' })).toContain('bg-secondary');
    expect(badgeVariants({ variant: 'accent' })).toContain('bg-accent/20');
    expect(badgeVariants({ variant: 'destructive' })).toContain('bg-destructive/15');
    expect(badgeVariants({ variant: 'outline' })).toContain('text-foreground');
  });

  it('renders the destructive variant in the DOM', () => {
    render(<Badge variant="destructive">Err</Badge>);
    expect(screen.getByText('Err')).toHaveClass('text-destructive');
  });

  it('renders as a child element when asChild is set', () => {
    render(
      <Badge asChild>
        <a href="/tag">Tagged</a>
      </Badge>,
    );
    const link = screen.getByRole('link', { name: 'Tagged' });
    expect(link).toHaveAttribute('href', '/tag');
    expect(link).toHaveClass('bg-primary/15');
  });
});
