import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- mocks for the Next/next-intl/server-action surface ---------------------
const refresh = vi.fn();
const setLocale = vi.fn().mockResolvedValue(undefined);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

// `useLocale` is the only next-intl API the switcher needs.
let currentLocale = 'pt-BR';
vi.mock('next-intl', () => ({
  useLocale: () => currentLocale,
}));

// server action ('use server') — stub it so it is a plain async fn in jsdom
vi.mock('@/i18n/locale-actions', () => ({
  setLocale: (...args: unknown[]) => setLocale(...args),
}));

import { LanguageSwitcher } from './language-switcher';
import { localeMeta } from '@/i18n/locales';

beforeEach(() => {
  refresh.mockReset();
  setLocale.mockClear();
  currentLocale = 'pt-BR';
});

describe('LanguageSwitcher', () => {
  it('shows the current locale flag and short label in the trigger', () => {
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole('button', { name: 'Language' });
    // the flag is an inline SVG (works on every OS), exposed as role="img"
    expect(
      within(trigger).getByRole('img', { name: localeMeta['pt-BR'].label }),
    ).toBeInTheDocument();
    expect(trigger).toHaveTextContent(localeMeta['pt-BR'].short); // "PT"
  });

  it('reflects a different current locale', () => {
    currentLocale = 'en-US';
    render(<LanguageSwitcher />);
    const trigger = screen.getByRole('button', { name: 'Language' });
    expect(
      within(trigger).getByRole('img', { name: localeMeta['en-US'].label }),
    ).toBeInTheDocument();
    expect(trigger).toHaveTextContent('EN');
  });

  /** Find the open menu item whose text contains the given locale label. */
  async function findItemByLabel(label: string) {
    const items = await screen.findAllByRole('menuitem');
    const match = items.find((el) => el.textContent?.includes(label));
    if (!match) throw new Error(`no menuitem containing "${label}"`);
    return match;
  }

  it('lists every locale with its flag and label when opened', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.click(screen.getByRole('button', { name: 'Language' }));

    const items = await screen.findAllByRole('menuitem');
    expect(items).toHaveLength(2);
    // both locales appear as menu items with their human label + flag
    const ptItem = await findItemByLabel(localeMeta['pt-BR'].label);
    const enItem = await findItemByLabel(localeMeta['en-US'].label);
    expect(
      within(ptItem).getByRole('img', { name: localeMeta['pt-BR'].label }),
    ).toBeInTheDocument();
    expect(
      within(enItem).getByRole('img', { name: localeMeta['en-US'].label }),
    ).toBeInTheDocument();
  });

  it('calls setLocale + router.refresh when a new locale is chosen', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />); // current = pt-BR
    await user.click(screen.getByRole('button', { name: 'Language' }));

    await user.click(await findItemByLabel(localeMeta['en-US'].label));

    expect(setLocale).toHaveBeenCalledWith('en-US');
    // refresh is fired inside the transition after the action resolves
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('does not switch when the current locale is re-selected', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />); // current = pt-BR
    await user.click(screen.getByRole('button', { name: 'Language' }));

    await user.click(await findItemByLabel(localeMeta['pt-BR'].label));

    expect(setLocale).not.toHaveBeenCalled();
  });
});
