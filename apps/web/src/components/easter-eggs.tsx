'use client';

import { useEffect } from 'react';
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
  useEffect(() => {
    /* eslint-disable no-console */
    console.log(
      "%cDon't Panic.",
      'color:#34d399;font-size:30px;font-weight:800;font-family:monospace',
    );
    console.log(
      '%c42 — the answer to life, the universe, and your next system. 🛸',
      'color:#fbbf24;font-family:monospace;font-size:13px',
    );
    /* eslint-enable no-console */

    let i = 0;
    function onKey(e: KeyboardEvent) {
      i = e.key === KONAMI[i] ? i + 1 : e.key === KONAMI[0] ? 1 : 0;
      if (i === KONAMI.length) {
        i = 0;
        toast('🐬 So long, and thanks for all the fish.', {
          description: 'Marvin: “Brain the size of a planet, and they ask me to render a toast.”',
        });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return null;
}
