import { MusicKitProvider } from "@/lib/musicKitClient";
import { MusicNav } from "@/components/dashboard/music/MusicNav";

/** MusicKitProvider lives at this layout level (not per-page) so
 * authorization state and playback survive navigating between
 * Home/Search/Library instead of re-initializing MusicKit on every
 * page. */
export default function MusicLayout({ children }: { children: React.ReactNode }) {
  return (
    <MusicKitProvider>
      <div className="flex flex-col gap-4">
        <MusicNav />
        {children}
      </div>
    </MusicKitProvider>
  );
}
