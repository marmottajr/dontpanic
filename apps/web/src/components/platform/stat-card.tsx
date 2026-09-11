import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

/**
 * A number card for the panel. Purely presentational: it takes the value
 * already formatted, so formatting (locale, currency) lives in one place.
 *
 * `tone` maps to theme tokens — never fixed colours — so the card reads equally
 * well in light and dark.
 */
export type StatTone = 'default' | 'trial' | 'active' | 'suspended' | 'canceled';

const TONE_CLASS: Record<StatTone, string> = {
  default: 'text-foreground',
  trial: 'text-accent-strong',
  active: 'text-primary',
  suspended: 'text-destructive',
  canceled: 'text-muted-foreground',
};

const TONE_RULE: Record<StatTone, string> = {
  default: 'bg-border',
  trial: 'bg-accent',
  active: 'bg-primary',
  suspended: 'bg-destructive',
  canceled: 'bg-muted-foreground/40',
};

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}

export function StatCard({ label, value, hint, tone = 'default', className }: StatCardProps) {
  return (
    <Card className={cn('relative overflow-hidden p-5', className)}>
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', TONE_RULE[tone])} />
      <div className="space-y-1 pl-2">
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn('font-display text-3xl font-bold tabular-nums', TONE_CLASS[tone])}>
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}

export { TONE_CLASS, TONE_RULE };
