import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';

// `next/link` wants the App Router context; in a unit test an anchor is all the
// panel actually needs from it.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: ComponentProps<'a'> & { children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { Panel, PanelEmpty, PanelRow } from './panel';

describe('Panel', () => {
  it('shows the title, the badge and the shortcut to the full listing', () => {
    render(
      <Panel title="Upcoming" badge={<span>3</span>} href="/events" linkLabel="See all">
        <p>content</p>
      </Panel>,
    );
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See all/ })).toHaveAttribute('href', '/events');
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('omits the shortcut when only half of it is given', () => {
    render(
      <Panel title="Upcoming" href="/events">
        <p>content</p>
      </Panel>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('omits the shortcut when neither half is given', () => {
    render(
      <Panel title="Upcoming" linkLabel="See all">
        <p>content</p>
      </Panel>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('PanelEmpty', () => {
  it('explains the emptiness instead of leaving a blank space', () => {
    render(<PanelEmpty>Nothing scheduled</PanelEmpty>);
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
  });
});

describe('PanelRow', () => {
  it('makes the whole row the link target', () => {
    render(
      <ul>
        <PanelRow href="/events/1">
          <span>Wedding</span>
        </PanelRow>
      </ul>,
    );
    const link = screen.getByRole('link', { name: 'Wedding' });
    expect(link).toHaveAttribute('href', '/events/1');
    expect(screen.getByRole('listitem')).toContainElement(link);
  });
});
