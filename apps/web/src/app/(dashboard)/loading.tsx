import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-10">
      {/* Hero block */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-12 w-72 max-w-full rounded-lg" />
        <Skeleton className="h-5 w-96 max-w-full rounded-md" />
      </div>

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm"
          >
            <Skeleton className="size-10 rounded-lg" />
            <Skeleton className="h-5 w-32 rounded-md" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-4/5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
