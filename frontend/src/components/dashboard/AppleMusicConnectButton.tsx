"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DisconnectButton } from "./DisconnectButton";
import { MusicKitProvider, useMusicKit } from "@/lib/musicKitClient";

/** Apple Music's connect action doesn't fit ConnectAction's
 * redirect-to-connectHref pattern every other provider uses — there's
 * no server-side authorize URL to redirect to at all, only a client-side
 * `MusicKit.authorize()` call. This mounts its own MusicKitProvider
 * scoped to just this card (not the whole Connections page), since
 * that's the only place on this page that needs the SDK loaded.
 * Disconnecting doesn't need MusicKit loaded at all, so it reuses the
 * plain DisconnectButton every other provider uses. */
export function AppleMusicConnectButton({ isActive }: { isActive: boolean }) {
  if (isActive) return <DisconnectButton provider="apple-music" />;

  return (
    <MusicKitProvider>
      <ConnectInner />
    </MusicKitProvider>
  );
}

function ConnectInner() {
  const router = useRouter();
  const { status, authorize, connectError } = useMusicKit();
  const [connecting, setConnecting] = useState(false);

  if (status.kind === "not_configured") {
    // Honest, not a broken button — see appleMusicService's
    // AppleMusicNotConfiguredError, surfaced verbatim from the backend.
    return <p className="text-xs text-ink-muted">{status.message}</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        disabled={connecting || status.kind === "loading"}
        onClick={async () => {
          setConnecting(true);
          try {
            await authorize();
            router.refresh();
          } finally {
            setConnecting(false);
          }
        }}
      >
        {connecting || status.kind === "loading"
          ? "Connecting…"
          : "Connect Apple Music"}
      </Button>
      {connectError && (
        <p role="alert" className="text-xs text-ink-muted">
          {connectError}
        </p>
      )}
    </div>
  );
}
