import { cn } from '@/lib/utils';
import { localeMeta, type Locale } from '@/i18n/locales';

// Inline SVG flags — emoji flags don't render on Windows (no regional-indicator
// support), so we draw them. Always visible, every OS.

function BrazilFlag() {
  return (
    <svg viewBox="0 0 28 20" className="block size-full" aria-hidden="true">
      <rect width="28" height="20" fill="#009b3a" />
      <path d="M14 3.4 24 10 14 16.6 4 10Z" fill="#ffdf00" />
      <circle cx="14" cy="10" r="3.7" fill="#002776" />
    </svg>
  );
}

function USFlag() {
  const stripe = 20 / 13;
  return (
    <svg viewBox="0 0 28 20" className="block size-full" aria-hidden="true">
      <rect width="28" height="20" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={i * stripe} width="28" height={stripe} fill="#b22234" />
      ))}
      <rect width="12.5" height={stripe * 7} fill="#3c3b6e" />
    </svg>
  );
}

export function FlagIcon({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <span
      role="img"
      aria-label={localeMeta[locale]?.label ?? locale}
      className={cn(
        'inline-block h-3.5 w-5 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10',
        className,
      )}
    >
      {locale === 'pt-BR' ? <BrazilFlag /> : <USFlag />}
    </span>
  );
}
