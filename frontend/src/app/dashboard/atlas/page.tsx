import { AtlasBackground } from "@/components/dashboard/atlas/AtlasBackground";
import { AtlasChat } from "@/components/dashboard/atlas/AtlasChat";

export default function AtlasPage() {
  return (
    <div className="relative isolate min-h-[calc(100vh-9rem)]">
      <AtlasBackground />
      <div className="relative z-10">
        <AtlasChat />
      </div>
    </div>
  );
}
