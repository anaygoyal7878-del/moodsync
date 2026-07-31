import { MusicKitProvider } from "@/lib/musicKitClient";
import { PremiumPlayer } from "@/components/player/PremiumPlayer";

/**
 * The full-bleed Listening Journey player.
 *
 * Wrapped in its own MusicKitProvider (rather than relying on a
 * layout-level one) for the same reason the other /dashboard/music/*
 * pages do: MusicKit JS loads from Apple's CDN at runtime and only the
 * routes that actually touch Apple Music should pay for it.
 */
export default function MusicPlayerPage() {
  return (
    <MusicKitProvider>
      <PremiumPlayer />
    </MusicKitProvider>
  );
}
