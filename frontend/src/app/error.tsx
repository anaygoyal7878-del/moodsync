"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Root error boundary — covers every route Next.js doesn't have a
 * closer one for (marketing, login/signup, onboarding, the Alexa
 * account-linking page). `/dashboard` has its own more specific
 * `dashboard/error.tsx`, which this file mirrors, and Next.js renders
 * whichever is closer to the segment that threw. Before this file
 * existed, an uncaught error anywhere outside `/dashboard` fell through
 * to Next's generic, unbranded error screen.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle size={24} className="text-danger" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">Something went wrong</p>
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
