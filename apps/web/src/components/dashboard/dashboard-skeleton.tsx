import { Skeleton } from '@/components/ui/skeleton';

/**
 * A dashboard is the first screen after login: while it loads it has to hold
 * the shape of what is coming, not a spinner in the middle of nowhere. The
 * boxes sit where the numbers will be, so the screen does not jump when they
 * arrive.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true" data-testid="dashboard-skeleton">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="space-y-2.5 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-3 w-24 rounded-md" />
            <Skeleton className="h-7 w-32 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="space-y-2.5 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="h-7 w-28 rounded-md" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((panel) => (
          <div
            key={panel}
            className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <Skeleton className="h-5 w-40 rounded-md" />
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="h-4 w-20 rounded-md" />
                <Skeleton className="h-4 flex-1 rounded-md" />
                <Skeleton className="h-4 w-20 rounded-md" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
