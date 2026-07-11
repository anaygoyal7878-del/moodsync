function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl border border-line bg-surface ${className}`} />;
}

/** Next.js renders this automatically while dashboard/page.tsx's parallel
 * backend fetches are in flight — shaped to roughly match the real
 * layout so the page doesn't visibly jump once data arrives. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-10 px-6 py-12 sm:py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </div>
        <div className="h-9 w-20 animate-pulse rounded-full bg-surface" />
      </header>

      <div className="flex flex-col gap-3">
        <div className="h-3 w-24 animate-pulse rounded bg-surface" />
        <SkeletonCard className="h-16" />
        <SkeletonCard className="h-16" />
        <SkeletonCard className="h-16" />
      </div>

      <div className="flex flex-col gap-3">
        <div className="h-3 w-40 animate-pulse rounded bg-surface" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SkeletonCard className="h-20" />
          <SkeletonCard className="h-20" />
          <SkeletonCard className="h-20" />
          <SkeletonCard className="h-20" />
        </div>
      </div>
    </div>
  );
}
