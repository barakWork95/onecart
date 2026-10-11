import { Skeleton } from "@/components/ui/skeleton";

export function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading results" className="flex flex-col gap-4">
      <Skeleton className="h-5 w-48" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-4 rounded-3xl border border-border/60 bg-card p-4">
          <Skeleton className="size-24 rounded-2xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-7 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
