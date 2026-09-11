'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPercent, type Variation } from './variation';

/**
 * The number block of a dashboard: small label, big value, context underneath.
 *
 * The value arrives already formatted — formatting belongs to the caller, and
 * here it only gets typography. `tone` marks the number the owner has to see
 * first (the overdue one, in red) without inventing colours outside the tokens.
 */
export type MetricTone = 'default' | 'positive' | 'alert';

const VALUE_TONE: Record<MetricTone, string> = {
  default: 'text-foreground',
  positive: 'text-primary',
  alert: 'text-destructive',
};

const CARD_TONE: Record<MetricTone, string> = {
  default: 'border-border',
  positive: 'border-border',
  alert: 'border-destructive/40 bg-destructive/5',
};

export function MetricCard({
  label,
  value,
  hint,
  tone = 'default',
  variation,
  footer,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTone;
  variation?: Variation | null;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border bg-card p-5 shadow-sm',
        CARD_TONE[tone],
      )}
    >
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {/* `whitespace-nowrap`: a currency value broken across two lines stops
          reading as a value. Across four columns, 20px is the largest body
          size that still keeps the whole number on one line. */}
      <p
        className={cn(
          'whitespace-nowrap font-mono text-xl font-semibold tabular-nums',
          VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      {variation ? <VariationTag variation={variation} /> : null}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {footer}
    </div>
  );
}

const DIRECTION_TONE = {
  up: 'text-primary',
  down: 'text-destructive',
  flat: 'text-muted-foreground',
} as const;

const DIRECTION_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

/** Arrow + magnitude. With no `previous`, the component is never rendered at all. */
export function VariationTag({ variation }: { variation: Variation }) {
  const t = useTranslations('dashboard.variation');
  const locale = useLocale();
  const Icon = DIRECTION_ICON[variation.direction];
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        DIRECTION_TONE[variation.direction],
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="font-mono tabular-nums">
        {t(variation.direction, { value: formatPercent(variation.percent, locale) })}
      </span>
      <span className="font-normal text-muted-foreground">{t('vsPrevious')}</span>
    </p>
  );
}
