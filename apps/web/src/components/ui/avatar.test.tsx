import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, AvatarImage, AvatarFallback } from './avatar';

describe('Avatar', () => {
  it('renders the root with rounded-full base classes', () => {
    render(
      <Avatar data-testid="avatar">
        <AvatarFallback>MV</AvatarFallback>
      </Avatar>,
    );
    const root = screen.getByTestId('avatar');
    expect(root).toBeInTheDocument();
    expect(root).toHaveClass('relative', 'rounded-full', 'overflow-hidden');
  });

  it('shows the fallback content (image never loads in jsdom)', () => {
    render(
      <Avatar>
        <AvatarImage src="/nope.png" alt="user" />
        <AvatarFallback>MV</AvatarFallback>
      </Avatar>,
    );
    const fallback = screen.getByText('MV');
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveClass('bg-muted', 'font-mono');
  });

  it('merges custom classes on root and fallback', () => {
    render(
      <Avatar className="size-16" data-testid="avatar">
        <AvatarFallback className="text-lg">AB</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByTestId('avatar')).toHaveClass('size-16');
    expect(screen.getByText('AB')).toHaveClass('text-lg', 'rounded-full');
  });
});
