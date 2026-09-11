import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardSkeleton } from './dashboard-skeleton';

describe('DashboardSkeleton', () => {
  it('holds the shape of the dashboard and stays out of the accessibility tree', () => {
    render(<DashboardSkeleton />);
    const skeleton = screen.getByTestId('dashboard-skeleton');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    // 4 metric cards + 3 small cards + 2 panels, each with its own placeholders
    expect(skeleton.querySelectorAll('.animate-pulse').length).toBeGreaterThan(20);
  });
});
