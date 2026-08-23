"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Section } from "./CompanionPrimitives";

interface CheckIn {
  id: string;
  valence: number;
  arousal: number;
  note: string | null;
  createdAt: string;
}

function describe(valence: number, arousal: number): string {
  const v = valence > 0 ? "pleasant" : valence < 0 ? "unpleasant" : "neutral";
  const a = arousal > 0 ? "activated" : arousal < 0 ? "calm" : "steady";
  return `${v}, ${a}`;
}

/** Exported so the page can trigger a reload after a new check-in
 * without the two components sharing state — the grid doesn't need to
 * know this list exists. */
export function RecentMoodCheckIns({ reloadKey }: { reloadKey: number }) {
  const [checkIns, setCheckIns] = useState<CheckIn[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/affect/check-ins", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ checkIns: CheckIn[] }>) : null))
      .then((data) => setCheckIns(data?.checkIns.slice().reverse() ?? []))
      .catch(() => setCheckIns([]));
  }, [reloadKey]);

  function remove(id: string) {
    setRemoving(id);
    fetch(`/api/affect/check-ins/${id}`, { method: "DELETE" })
      .then(() => setCheckIns((prev) => (prev ?? []).filter((c) => c.id !== id)))
      .catch(() => {})
      .finally(() => setRemoving(null));
  }

  if (!checkIns || checkIns.length === 0) return null;

  return (
    <Section title="Recent check-ins" subtitle="Most recent first">
      <ul className="space-y-2">
        {checkIns.slice(0, 15).map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--lux-bg-card-2)" }}>
            <span className="min-w-0 flex-1">
              <span className="block text-sm" style={{ color: "var(--lux-ink)" }}>
                {describe(c.valence, c.arousal)}
                {c.note && <span style={{ color: "var(--lux-muted)" }}> — {c.note}</span>}
              </span>
              <span className="block text-xs" style={{ color: "var(--lux-muted)" }}>
                {new Date(c.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={removing === c.id}
              aria-label="Delete this check-in"
              className="shrink-0 rounded-lg p-1"
              style={{ color: "var(--lux-muted)" }}
            >
              <X size={16} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
