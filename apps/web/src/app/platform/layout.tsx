'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, Building2, Tags } from 'lucide-react';
import { Brand } from '@/components/brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';
import { cn } from '@/lib/utils';
import { usePlatformAccess } from '@/components/platform/platform-api';

/**
 * The platform panel's own shell.
 *
 * It deliberately does **not** reuse the company shell: the superadmin belongs
 * to no company, and putting a tenant's navigation in front of them would imply
 * a context they do not have.
 *
 * Nothing is painted until the role is confirmed. Anyone who is not SUPERADMIN
 * is redirected away without seeing a title, navigation, or even an error
 * message — nothing here reveals that this panel exists.
 */
const NAV = [
  { href: '/platform', key: 'overview', icon: BarChart3, exact: true },
  { href: '/platform/tenants', key: 'tenants', icon: Building2, exact: false },
  { href: '/platform/plans', key: 'plans', icon: Tags, exact: false },
] as const;

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('platform');
  const pathname = usePathname();
  const { allowed, checking } = usePlatformAccess();

  if (checking || !allowed) return null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-sidebar">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/platform"
            className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Brand size="sm" />
          </Link>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-widest text-primary">
            {t('badge')}
          </span>

          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>

        <nav aria-label={t('navLabel')} className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <ul className="flex gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                      active
                        ? 'border-primary font-medium text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {t(`nav.${item.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="flex-1 px-4 py-8 sm:px-6 md:py-10">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="px-6 py-5 text-center font-mono text-xs text-muted-foreground">
          {t('footer')}
        </div>
      </footer>
    </div>
  );
}
