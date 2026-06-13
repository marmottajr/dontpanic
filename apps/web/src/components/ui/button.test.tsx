import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, buttonVariants } from './button';

describe('Button', () => {
  it('renders as a button with its text content', () => {
    render(<Button>Click me</Button>);
    const btn = screen.getByRole('button', { name: 'Click me' });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('applies the default variant + size classes', () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole('button');
    // default variant -> bg-primary, default size -> h-10
    expect(btn).toHaveClass('bg-primary');
    expect(btn).toHaveClass('h-10');
  });

  it('renders each variant + size with its distinguishing class', () => {
    // exercise the variant function directly so every branch is covered
    expect(buttonVariants({ variant: 'destructive' })).toContain('bg-destructive');
    expect(buttonVariants({ variant: 'outline' })).toContain('border-input');
    expect(buttonVariants({ variant: 'secondary' })).toContain('bg-secondary');
    expect(buttonVariants({ variant: 'ghost' })).toContain('hover:bg-accent/30');
    expect(buttonVariants({ variant: 'link' })).toContain('underline-offset-4');
    expect(buttonVariants({ size: 'sm' })).toContain('h-8');
    expect(buttonVariants({ size: 'lg' })).toContain('h-11');
    expect(buttonVariants({ size: 'icon' })).toContain('size-10');
  });

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Press</Button>);
    await user.click(screen.getByRole('button', { name: 'Press' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders as a child element (asChild) without a button wrapper', () => {
    render(
      <Button asChild>
        <a href="/somewhere">Go</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/somewhere');
    // asChild means there is no nested native button
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // and the styling is forwarded onto the anchor
    expect(link).toHaveClass('bg-primary');
  });

  it('merges a custom className with variant classes', () => {
    render(<Button className="custom-x">Merged</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveClass('custom-x');
    expect(btn).toHaveClass('bg-primary');
  });
});
