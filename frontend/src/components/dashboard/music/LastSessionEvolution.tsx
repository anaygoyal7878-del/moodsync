"use client";

import { useEffect, useState } from "react";
import { SessionEvolutionChart } from "./SessionEvolutionChart";

/**
 * The most recent session's biometric evolution.
 *
 * Renders nothing at all when there is no session to show. An empty
 * chart frame with an axis and no line is worse than absence — it
 * reads as broken rather than as "you haven't listened yet", and this
 * sits on a page that already has plenty to look at.
 */
interface RecentSession {
  id: string;
  itemName: string;
  mode: string;
  startedAt: string;
}

export function LastSessionEvolution() {
  const [session, setSession] = useState<RecentSession | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/music-sessions?limit=1")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { sessions?: RecentSession[] }) => {
        if (!cancelled) setSession(data.sessions?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (session === undefined || session === null) return null;

  const when = new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">How your last session moved</h2>
      <div
        className="rounded-[20px] p-4"
        style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)", boxShadow: "var(--elev-2)" }}
      >
        <p className="mb-3 text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
          {session.itemName} · {when}
        </p>
        <SessionEvolutionChart sessionId={session.id} />
        <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
          Heart rate is measured by your device. Stress is MoodSync&apos;s own computed score, drawn dashed because it is
          an estimate rather than a direct reading — and a session moving with the music is an association, not proof the
          music caused it.
        </p>
      </div>
    </section>
  );
}
