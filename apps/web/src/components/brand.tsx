import { cn } from '@/lib/utils';

type BrandSize = 'sm' | 'md' | 'lg';

const sizeMap: Record<BrandSize, { mark: string; word: string; badge: string }> = {
  sm: { mark: 'size-6', word: 'text-base', badge: 'text-[0.5rem] px-1 py-px' },
  md: { mark: 'size-7', word: 'text-lg', badge: 'text-[0.5rem] px-1 py-px' },
  lg: { mark: 'size-9', word: 'text-2xl', badge: 'text-[0.625rem] px-1.5 py-0.5' },
};

/**
 * The DontPanic wordmark lockup: a phosphor-green "towel" mark + the wordmark
 * in font-display, trailed by the mono "42" badge (the answer). Scales via `size`
 * and is purely presentational — wrap it in a <Link> where you need navigation.
 */
export function Brand({
  className,
  size = 'md',
  showBadge = true,
}: {
  className?: string;
  size?: BrandSize;
  showBadge?: boolean;
}) {
  const s = sizeMap[size];
  return (
    <span className={cn('inline-flex select-none items-center gap-2', className)}>
      <BrandMark className={cn(s.mark, 'shrink-0 text-primary')} />
      <span className={cn('font-display font-semibold leading-none tracking-tight', s.word)}>
        Dont<span className="text-primary">Panic</span>
      </span>
      {showBadge && (
        <span
          className={cn(
            'rounded-[0.3rem] border border-accent/40 bg-accent/10 font-mono font-medium leading-none text-accent-foreground/80 dark:text-accent',
            s.badge,
          )}
          aria-hidden="true"
        >
          42
        </span>
      )}
    </span>
  );
}

/**
 * The bare mark — a folded towel inside a rounded "guide" tile. Inherits
 * `currentColor`, so set the color via text-* on the parent.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="DontPanic"
      className={className}
    >
      <rect
        x="1.25"
        y="1.25"
        width="29.5"
        height="29.5"
        rx="8"
        className="fill-current opacity-15"
      />
      <rect
        x="1.25"
        y="1.25"
        width="29.5"
        height="29.5"
        rx="8"
        className="stroke-current opacity-40"
        strokeWidth="1.5"
      />
      {/* the towel — always carry yours */}
      <path
        d="M9 9.5h14M9 9.5v13a2 2 0 0 0 2 2h3.5V9.5M16.5 9.5v15M23 9.5v8.5a2 2 0 0 1-2 2h-2.5"
        className="stroke-current"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Inline favicon glyph (also mirrored at public/favicon.svg for the document icon).
 */
export function Favicon({ className }: { className?: string }) {
  return <BrandMark className={cn('text-primary', className)} />;
}
