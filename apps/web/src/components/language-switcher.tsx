'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { setLocale } from '@/i18n/locale-actions';
import { localeMeta, locales, type Locale } from '@/i18n/locales';
import { Button } from '@/components/ui/button';
import { FlagIcon } from '@/components/flags';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface LanguageSwitcherProps {
  /** Where the menu opens relative to the trigger. Pin it to avoid the Radix
   *  collision flip flicker (e.g. `top` when the switcher sits in a footer). */
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export function LanguageSwitcher({ side = 'bottom', align = 'end' }: LanguageSwitcherProps) {
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
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          disabled={pending}
          aria-label="Language"
        >
          <FlagIcon locale={locale} />
          <span className="font-mono text-xs">{current.short}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align={align} sideOffset={8}>
        {locales.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => change(l)} className="gap-2.5">
            <FlagIcon locale={l} />
            <span>{localeMeta[l].label}</span>
            {l === locale && <span className="ml-auto font-mono text-xs text-primary">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
