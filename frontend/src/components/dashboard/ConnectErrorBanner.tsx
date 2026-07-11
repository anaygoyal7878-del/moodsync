import Link from "next/link";

const PROVIDER_LABELS: Record<string, string> = {
  whoop: "WHOOP",
  hue: "Hue",
  "google-health": "Fitbit",
  spotify: "Spotify",
};

function messageFor(error: string): string {
  const match = /^([a-z-]+)_unavailable$/.exec(error);
  if (match) {
    const provider = PROVIDER_LABELS[match[1] as string] ?? match[1];
    return `${provider} isn't configured on this server yet, so it can't be connected right now.`;
  }
  return "Something went wrong starting that connection. Please try again.";
}

/** Connect routes redirect back here with `?error=` on failure (see
 * frontend/src/app/api/integrations/[provider]/connect/route.ts) — this
 * is the one place that turns that into something the user actually
 * sees, instead of a query param nothing reads. */
export function ConnectErrorBanner({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-xl border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-200"
    >
      <span>{messageFor(error)}</span>
      <Link href="/dashboard" className="shrink-0 text-red-200/70 underline-offset-2 hover:text-red-100 hover:underline">
        Dismiss
      </Link>
    </div>
  );
}
