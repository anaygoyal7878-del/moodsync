"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";

interface StudyPlanResponse {
  suggestion: { start: string; end: string; reason: string } | null;
  calendarConnected: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * Adaptive Study Planner — suggests the single longest free window left
 * today (see ai/src/studyPlanner.ts), not a generic "study whenever."
 * Only renders once Google Calendar is connected — with no calendar,
 * there's no real free/busy signal to plan around, so this stays
 * hidden rather than guessing.
 */
export function StudyPlannerCard() {
  const [plan, setPlan] = useState<StudyPlanResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/study-plan", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<StudyPlanResponse>) : null))
      .then((data) => {
        if (!cancelled && data) setPlan(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!plan || !plan.calendarConnected) return null;

  return (
    <section
      className="lux-stagger-3 rounded-[24px] p-5"
      style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
    >
      <div className="flex items-center gap-2">
        <BookOpen size={16} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
        <h2 className="font-luxury-display text-[15px] font-semibold" style={{ color: "var(--lux-ink)" }}>
          Best time to focus today
        </h2>
      </div>
      {plan.suggestion ? (
        <>
          <p className="font-luxury-display tabular mt-2 text-[22px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            {formatTime(plan.suggestion.start)} – {formatTime(plan.suggestion.end)}
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--lux-muted)" }}>
            {plan.suggestion.reason}
          </p>
          <Link href="/dashboard/focus" className="mt-3 inline-block text-[12px] font-medium" style={{ color: "var(--lux-sage)" }}>
            Start a Focus Session →
          </Link>
        </>
      ) : (
        <p className="mt-2 text-[13px]" style={{ color: "var(--lux-muted)" }}>
          No clear stretch of free time left today.
        </p>
      )}
    </section>
  );
}
