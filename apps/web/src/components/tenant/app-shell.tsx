'use client';

import { createContext, useContext, useMemo, useState } from 'react';

/**
 * Shared shell state: only the navigation drawer on small screens.
 *
 * It lives in a context because the element that opens it (the header button)
 * and the element that closes it (the drawer) are siblings, not parent and
 * child.
 */
export interface AppShellState {
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

const AppShellContext = createContext<AppShellState>({
  mobileNavOpen: false,
  setMobileNavOpen: () => {},
});

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const value = useMemo(() => ({ mobileNavOpen, setMobileNavOpen }), [mobileNavOpen]);
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export const useAppShell = (): AppShellState => useContext(AppShellContext);
