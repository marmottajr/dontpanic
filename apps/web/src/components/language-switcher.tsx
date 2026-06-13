'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocale } from '@/i18n/locale-actions';
import { localeMeta, locales, type Locale } from '@/i18n/locales';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = localeMeta[locale] ?? localeMeta['pt-BR'];

  function change(next: Locale) {
    if (next === locale) return;
    start(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" disabled={pending} aria-label="Language">
          <span className="text-base leading-none">{current.flag}</span>
          <span className="font-mono text-xs">{current.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => change(l)} className="gap-2.5">
            <span className="text-base leading-none">{localeMeta[l].flag}</span>
            <span>{localeMeta[l].label}</span>
            {l === locale && <span className="ml-auto font-mono text-xs text-primary">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
