'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Keyboard-first record list: whoever enters data all day long should never be
 * forced onto the mouse. Arrows walk the rows, `Home`/`End` jump to the ends,
 * `Enter` opens. The mouse still works — it just stopped being mandatory.
 *
 * Every string arrives through `labels`, so the component carries no copy of
 * its own and stays reusable across any domain.
 */

export interface RecordColumn<T> {
  id: string;
  header: string;
  cell: (item: T) => ReactNode;
  /** Cell class — use it to right-align, hide on small screens, etc. */
  className?: string;
  headerClassName?: string;
}

export interface KeyboardListLabels {
  loading: string;
  error: string;
  retry: string;
  empty: string;
  emptyHint?: string;
  /** Shortcut hint shown under the list. */
  hint?: string;
  actions?: string;
}

export interface KeyboardListProps<T> {
  items: T[];
  columns: RecordColumn<T>[];
  getKey: (item: T) => string;
  labels: KeyboardListLabels;
  onOpen?: (item: T) => void;
  rowActions?: (item: T) => ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyAction?: ReactNode;
  /** Flags a row visually (e.g. a stalled record, a blocked customer). */
  rowClassName?: (item: T) => string | undefined;
  'aria-label'?: string;
}

export function KeyboardList<T>({
  items,
  columns,
  getKey,
  labels,
  onOpen,
  rowActions,
  isLoading = false,
  isError = false,
  onRetry,
  emptyAction,
  rowClassName,
  ...rest
}: KeyboardListProps<T>) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const columnCount = columns.length + (rowActions ? 1 : 0);

  const focusRow = (index: number) => {
    const rows = bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row]');
    if (!rows || rows.length === 0) return;
    const target = rows[Math.max(0, Math.min(index, rows.length - 1))];
    target?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number, item: T) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusRow(0);
        break;
      case 'End':
        event.preventDefault();
        focusRow(items.length - 1);
        break;
      case 'Enter':
        // Enter inside a row button belongs to the button, not to the row.
        if (event.target === event.currentTarget && onOpen) {
          event.preventDefault();
          onOpen(item);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm" aria-label={rest['aria-label']}>
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.id} className={cn('px-4 py-3 font-medium', column.headerClassName)}>
                  {column.header}
                </th>
              ))}
              {rowActions ? (
                <th className="px-4 py-3 text-right font-medium">{labels.actions ?? ''}</th>
              ) : null}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {isLoading ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {labels.loading}
                  </span>
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-2 text-destructive">
                      <AlertCircle className="size-4" aria-hidden="true" />
                      {labels.error}
                    </span>
                    {onRetry ? (
                      <Button size="sm" variant="outline" onClick={onRetry}>
                        {labels.retry}
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="font-medium">{labels.empty}</p>
                    {labels.emptyHint ? (
                      <p className="max-w-md text-sm text-muted-foreground">{labels.emptyHint}</p>
                    ) : null}
                    {emptyAction ? <div className="pt-1">{emptyAction}</div> : null}
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr
                  key={getKey(item)}
                  data-row=""
                  tabIndex={0}
                  onKeyDown={(event) => handleKeyDown(event, index, item)}
                  className={cn(
                    'border-t border-border outline-none transition-colors',
                    'hover:bg-muted/40 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/40',
                    onOpen && 'cursor-pointer',
                    rowClassName?.(item),
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn('px-4 py-3 align-middle', column.className)}
                      onClick={() => onOpen?.(item)}
                    >
                      {column.cell(item)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">{rowActions(item)}</div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {labels.hint && items.length > 0 ? (
        <p className="text-xs text-muted-foreground">{labels.hint}</p>
      ) : null}
    </div>
  );
}
