import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatCard, TONE_CLASS, TONE_RULE, type StatTone } from './stat-card';

afterEach(cleanup);

describe('StatCard', () => {
  it('shows the label and the already-formatted value', () => {
    render(<StatCard label="Companies" value="1,234" />);

    expect(screen.getByText('Companies')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('shows the hint only when there is one', () => {
    const { unmount } = render(<StatCard label="Users" value="12" hint="last 30 days" />);
    expect(screen.getByText('last 30 days')).toBeInTheDocument();
    unmount();

    render(<StatCard label="Users" value="12" />);
    expect(screen.queryByText('last 30 days')).not.toBeInTheDocument();
  });

  it('paints every tone through a theme token, never a fixed colour', () => {
    const tones: StatTone[] = ['default', 'trial', 'active', 'suspended', 'canceled'];
    for (const tone of tones) {
      const { container, unmount } = render(<StatCard label="x" value="1" tone={tone} />);
      expect(container.innerHTML).toContain(TONE_CLASS[tone]);
      expect(container.innerHTML).toContain(TONE_RULE[tone]);
      expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}/i);
      unmount();
    }
  });

  it('accepts extra classes from the caller', () => {
    const { container } = render(<StatCard label="x" value="1" className="col-span-2" />);
    expect(container.firstElementChild?.className).toContain('col-span-2');
  });
});
