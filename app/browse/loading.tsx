import { Skeleton } from "@/components/ui/skeleton";

export default function BrowseLoading() {
  return (
    <div className="container-page space-y-10 py-10">
      <div className="space-y-3">
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <div className="grid grid-cols-1 gap-2.5 pt-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
      {Array.from({ length: 2 }).map((_, r) => (
        <div key={r} className="space-y-3">
          <Skeleton className="h-10 w-64" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-72 shrink-0 rounded-2xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
