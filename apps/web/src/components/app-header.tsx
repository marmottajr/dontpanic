'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Brand } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { cn } from '@/lib/utils';

export function AppHeader() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  const links = [
    { href: '/', label: t('dashboard') },
    { href: '/profile', label: t('profile') },
  ];

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="DontPanic"
        >
          <Brand size="md" />
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden items-center gap-1 sm:flex">
          {links.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {/* Compact nav for small screens. */}
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-6xl items-center gap-1 border-t border-border px-2 py-1.5 sm:hidden"
      >
        {links.map((link) => {
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
