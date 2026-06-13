import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from './alert';

describe('Alert', () => {
  it('renders with the alert role and composes title + description', () => {
    render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Something happened.</AlertDescription>
      </Alert>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Something happened.')).toBeInTheDocument();
    // default variant
    expect(alert).toHaveClass('bg-card');
  });

  it('applies the destructive variant classes', () => {
    render(
      <Alert variant="destructive">
        <AlertDescription>Boom</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveClass('text-destructive');
  });

  it('applies the success variant classes', () => {
    render(
      <Alert variant="success">
        <AlertDescription>Done</AlertDescription>
      </Alert>,
    );
    expect(screen.getByRole('alert')).toHaveClass('text-primary');
  });
});
