import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { SessionEndedReason } from '@dontpanic/shared';
import type { SessionEndedListener } from '@/lib/api';

/**
 * Stand-in for the api client's pub/sub so a test can end the session on
 * demand, without a fake network underneath.
 */
const listeners = new Set<SessionEndedListener>();
const redirectToLoginMock = vi.fn();

vi.mock('@/lib/api', () => ({
  onSessionEnded: (listener: SessionEndedListener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  redirectToLogin: () => redirectToLoginMock(),
}));

import { SessionEndedDialog } from './session-ended-dialog';

/** Fire the session-ended event and report what the listeners answered. */
function endSession(reason: SessionEndedReason): boolean {
  let handled = false;
  act(() => {
    for (const listener of listeners) if (listener(reason) === true) handled = true;
  });
  return handled;
}

const messages = {
  session: {
    signInAgain: 'Sign in again',
    changePassword: 'Change password',
    advice: 'If this wasn’t you, change your password now.',
    expired: { title: 'Your session expired', description: 'You were away too long.' },
    'signed-in-elsewhere': {
      title: 'You signed in on another device',
      description: 'Someone signed in elsewhere.',
    },
    'reuse-detected': {
      title: 'We ended your session for safety',
      description: 'Suspicious use of this session.',
    },
  },
};

function mount() {
  return render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      <SessionEndedDialog />
    </NextIntlClientProvider>,
  );
}

const assignMock = vi.fn();

beforeEach(() => {
  listeners.clear();
  redirectToLoginMock.mockReset();
  assignMock.mockReset();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname: '/dashboard', search: '', assign: assignMock },
  });
});

afterEach(cleanup);

describe('SessionEndedDialog', () => {
  it('renders nothing until the session ends', () => {
    mount();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(listeners.size).toBe(1);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = mount();
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it.each([
    ['expired', 'Your session expired', 'You were away too long.', false],
    [
      'signed-in-elsewhere',
      'You signed in on another device',
      'Someone signed in elsewhere.',
      true,
    ],
    ['reuse-detected', 'We ended your session for safety', 'Suspicious use of this session.', true],
  ] as const)('explains %s', (reason, title, description, advises) => {
    mount();
    expect(endSession(reason)).toBe(true);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(title);
    expect(dialog).toHaveTextContent(description);

    // The password advice is only useful when someone else may hold the password.
    expect(dialog.textContent?.includes('change your password now')).toBe(advises);
    expect(screen.queryByRole('button', { name: 'Change password' })).toEqual(
      advises ? expect.anything() : null,
    );
  });

  it('stays out of the way for an ordinary logout the user performed', () => {
    mount();
    // Nothing claimed the explanation, so the client is free to redirect.
    expect(endSession('logout')).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends the user to login from the primary action', async () => {
    const user = userEvent.setup();
    mount();
    endSession('expired');

    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(redirectToLoginMock).toHaveBeenCalled();
  });

  it('sends the user to login when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    mount();
    endSession('expired');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(redirectToLoginMock).toHaveBeenCalled();
  });

  it('offers the password reset flow when someone else may know the password', async () => {
    const user = userEvent.setup();
    mount();
    endSession('reuse-detected');

    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(assignMock).toHaveBeenCalledWith('/forgot-password');
  });
});
