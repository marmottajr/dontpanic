'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * List panel: title, a shortcut to the full listing, and the content.
 *
 * It exists so that every block on a dashboard shares the same header and the
 * same empty state — a panel has to read as one single thing.
 */
export function Panel({
  title,
  badge,
  href,
  linkLabel,
  children,
}: {
  title: string;
  badge?: ReactNode;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {badge}
        </div>
        {href && linkLabel ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            {linkLabel}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">{children}</CardContent>
    </Card>
  );
}

/** Empty list: one sober sentence, never a blank space without an explanation. */
export function PanelEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** A clickable list row — the touch target is the whole row, not just the text. */
export function PanelRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {children}
      </Link>
    </li>
  );
}
