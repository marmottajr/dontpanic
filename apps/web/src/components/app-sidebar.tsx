'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Menu, User, X } from 'lucide-react';
import { Brand } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', key: 'dashboard', icon: LayoutDashboard, exact: true },
  { href: '/profile', key: 'profile', icon: User, exact: false },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ href, key, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )}
          >
            <Icon className="size-4.5 shrink-0" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <Link href="/" onClick={onNavigate} aria-label="DontPanic">
          <Brand />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        <NavLinks onNavigate={onNavigate} />
      </div>
      <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between">
          <LanguageSwitcher side="top" align="start" />
          <ThemeToggle />
        </div>
        <UserMenu />
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: persistent vertical sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarBody />
      </aside>

      {/* Mobile: top bar with a menu button */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-sidebar-border bg-sidebar/90 px-4 py-3 backdrop-blur md:hidden">
        <Brand size="sm" />
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu className="size-5" />
        </Button>
      </header>

      {/* Mobile: slide-in drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-sidebar-border bg-sidebar shadow-xl animate-in slide-in-from-left">
            <div className="flex justify-end p-2">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            <div className="h-[calc(100%-3rem)]">
              <SidebarBody onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
