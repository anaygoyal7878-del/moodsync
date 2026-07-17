"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/** Next.js renders this for any uncaught error thrown while rendering
 * dashboard/page.tsx or its children — previously nothing existed here,
 * so a real error would fall through to the framework's generic error
 * screen instead of something on-brand with a retry path. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle size={24} className="text-danger" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">Something went wrong loading your dashboard</p>
        <p className="max-w-sm text-sm text-ink-secondary">
          This is on our end, not something you did — try again, and if it keeps happening, refresh the page.
        </p>
        <Button variant="secondary" onClick={reset} className="mt-2">
          Try again
        </Button>
      </Card>
    </div>
  );
}
