'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/** Secret console greeting + Konami code. Mounted once on the dashboard. */
export function EasterEggs() {
  const t = useTranslations('easter');

  useEffect(() => {
    console.log(
      `%c${t('consoleTitle')}`,
      'color:#34d399;font-size:30px;font-weight:800;font-family:monospace',
    );
    console.log(`%c${t('consoleSubtitle')}`, 'color:#fbbf24;font-family:monospace;font-size:13px');

    let i = 0;
    function onKey(e: KeyboardEvent) {
      i = e.key === KONAMI[i] ? i + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (i === KONAMI.length) {
        i = 0;
        toast(t('konamiTitle'), { description: t('konamiDescription') });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [t]);

  return null;
}
