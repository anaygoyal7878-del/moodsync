import { Skeleton } from "@/components/ui/Skeleton";

/** Next.js renders this while a /dashboard/* layout+page's backend
 * fetches are in flight. Generic on purpose — this file now covers every
 * feature page (connections, biometrics, wellness, ...), not one fixed
 * long-scroll shape, so it can't match any single page's exact layout. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-8 px-6 py-12 sm:py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </div>
        <Skeleton className="h-9 w-20 rounded-full" />
      </header>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28 rounded" />
        <Skeleton className="h-16 rounded-2xl border border-line" />
        <Skeleton className="h-16 rounded-2xl border border-line" />
        <Skeleton className="h-16 rounded-2xl border border-line" />
      </div>
    </div>
  );
}
