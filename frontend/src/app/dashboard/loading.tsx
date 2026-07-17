import { Skeleton } from "@/components/ui/Skeleton";

function SectionHeading() {
  return <Skeleton className="h-3 w-28 rounded" />;
}

function CardSkeleton({ className = "h-16" }: { className?: string }) {
  return <Skeleton className={`rounded-2xl border border-line ${className}`} />;
}

/** Next.js renders this automatically while dashboard/page.tsx's parallel
 * backend fetches are in flight — shaped to roughly match each real
 * section's layout (not one generic block) so the page doesn't visibly
 * jump once data arrives. Uses the shared Skeleton primitive rather than
 * a one-off local component. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-10 px-6 py-12 sm:py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </div>
        <Skeleton className="h-9 w-20 rounded-full" />
      </header>

      {/* Connections */}
      <div className="flex flex-col gap-3">
        <SectionHeading />
        <CardSkeleton className="h-16" />
        <CardSkeleton className="h-16" />
        <CardSkeleton className="h-16" />
      </div>

      {/* Biometrics */}
      <div className="flex flex-col gap-3">
        <SectionHeading />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CardSkeleton className="h-20" />
          <CardSkeleton className="h-20" />
          <CardSkeleton className="h-20" />
          <CardSkeleton className="h-20" />
        </div>
      </div>

      {/* Wellness */}
      <div className="flex flex-col gap-3">
        <SectionHeading />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CardSkeleton className="h-20" />
          <CardSkeleton className="h-20" />
          <CardSkeleton className="h-20" />
          <CardSkeleton className="h-20" />
        </div>
      </div>

      {/* Insights */}
      <div className="flex flex-col gap-3">
        <SectionHeading />
        <CardSkeleton className="h-28" />
      </div>

      {/* Devices */}
      <div className="flex flex-col gap-3">
        <SectionHeading />
        <div className="grid grid-cols-2 gap-3">
          <CardSkeleton className="h-16" />
          <CardSkeleton className="h-16" />
        </div>
      </div>

      {/* Automation rules */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionHeading />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
        <CardSkeleton className="h-14" />
        <CardSkeleton className="h-14" />
      </div>

      {/* Notifications */}
      <div className="flex flex-col gap-3">
        <SectionHeading />
        <CardSkeleton className="h-24" />
      </div>
    </div>
  );
}
