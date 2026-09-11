'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** The header every record screen shares: title, subtitle and the main action. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="font-mono text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Filter bar — search on the left, selects on the right. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-2">{children}</div>;
}

/**
 * Page stepper. It hides itself when there is nothing to page through: an empty
 * list shows no controls at all, and a single page keeps only the counter.
 */
export function Pagination({
  page,
  totalPages,
  total,
  pageLabel,
  totalLabel,
  prevLabel,
  nextLabel,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageLabel: string;
  totalLabel: string;
  prevLabel: string;
  nextLabel: string;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">
        {totalLabel}
        {totalPages > 1 ? ` · ${pageLabel}` : ''}
      </span>
      {totalPages > 1 ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            {prevLabel}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            {nextLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
