import type { LucideIcon } from "lucide-react";
import { timeAgo } from "@/lib/activityDisplay";
import type { AutomationHistoryEntry } from "@/lib/types";

/** Ported from the Superdesign ActivityRow component, wired to the same
 * real automation-history entries RecentActivity.tsx already renders
 * (see that file's doc comment) — same data, restyled card shell.
 * `icon` is resolved by the caller's map loop (matching
 * RecentActivity.tsx's own pattern) rather than looked up in here,
 * since eslint's react-hooks/static-components rule flags a component
 * reference assigned inside a component's own top-level render body. */
export function LuxuryActivityRow({ entry, icon: Icon }: { entry: AutomationHistoryEntry; icon: LucideIcon }) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl p-3.5"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: "rgba(95,184,120,0.16)" }}
      >
        <Icon size={18} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
          {entry.rule.name}
        </p>
        <p className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
          {timeAgo(entry.executedAt)}
        </p>
      </div>
    </div>
  );
}
