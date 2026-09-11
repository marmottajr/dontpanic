import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShellProvider, useAppShell } from './app-shell';

afterEach(cleanup);

function Probe() {
  const { mobileNavOpen, setMobileNavOpen } = useAppShell();
  return (
    <div>
      <span data-testid="state">{String(mobileNavOpen)}</span>
      <button onClick={() => setMobileNavOpen(!mobileNavOpen)}>toggle</button>
    </div>
  );
}

describe('AppShellProvider', () => {
  it('shares the drawer state between siblings', async () => {
    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>,
    );

    expect(screen.getByTestId('state')).toHaveTextContent('false');
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('state')).toHaveTextContent('true');
  });

  it('falls back to a closed, inert drawer outside any provider', async () => {
    render(<Probe />);

    expect(screen.getByTestId('state')).toHaveTextContent('false');
    // The default setter is a no-op: a component rendered outside the shell
    // must not throw, it just cannot open a drawer that is not there.
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('state')).toHaveTextContent('false');
  });
});
