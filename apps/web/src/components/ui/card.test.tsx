import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

describe('Card composition', () => {
  it('renders all sub-parts in order with their content', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>The Title</CardTitle>
          <CardDescription>A short description</CardDescription>
        </CardHeader>
        <CardContent>Body content</CardContent>
        <CardFooter>
          <button>Footer action</button>
        </CardFooter>
      </Card>,
    );

    expect(screen.getByText('The Title')).toBeInTheDocument();
    expect(screen.getByText('A short description')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Footer action' })).toBeInTheDocument();

    const card = screen.getByTestId('card');
    // title is nested inside the card -> composition wired correctly
    expect(card).toContainElement(screen.getByText('The Title'));
    expect(card).toHaveClass('rounded-xl');
  });

  it('merges custom classes onto the card root', () => {
    render(<Card className="extra-card" data-testid="c" />);
    const card = screen.getByTestId('c');
    expect(card).toHaveClass('extra-card');
    expect(card).toHaveClass('bg-card');
  });
});
