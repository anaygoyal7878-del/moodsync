import { Skeleton } from "@/components/ui/Skeleton";

/** Next.js renders this while a /dashboard/* page's backend fetches are
 * in flight — the parent layout (Sidebar + <main> shell) is already on
 * screen by this point, so this only needs to skeleton the content
 * area itself. Generic on purpose — this file covers every feature page
 * (connections, biometrics, wellness, ...), not one fixed shape. */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3 w-28 rounded" />
      <Skeleton className="h-16 rounded-2xl border border-line" />
      <Skeleton className="h-16 rounded-2xl border border-line" />
      <Skeleton className="h-16 rounded-2xl border border-line" />
    </div>
  );
}
