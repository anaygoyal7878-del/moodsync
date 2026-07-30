"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Waves } from "lucide-react";
import { Section, EmptyState, toneColor } from "./CompanionPrimitives";
import type { StressTimelineResponse } from "@/lib/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/**
 * The day's stress *timeline* rather than one average number — the
 * moments heart rate moved meaningfully against its own daily baseline,
 * with the calendar event overlapping each one where there is one.
 *
 * A shift with no matching event shows no cause rather than a guessed
 * one; that's the difference between this and a chart that implies
 * meaning it doesn't have.
 */
export function StressTimeline() {
  const [data, setData] = useState<StressTimelineResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stress-timeline", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<StressTimelineResponse>) : null))
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return (
      <Section title="Today's stress timeline" icon={Waves}>
        <div className="h-20 animate-pulse rounded-xl" style={{ background: "var(--lux-bg-card-2)" }} />
      </Section>
    );
  }

  const entries = data?.timeline ?? [];

  return (
    <Section
      title="Today's stress timeline"
      subtitle={data?.calendarConnected ? "Matched against your calendar." : "Connect a calendar to see what caused each shift."}
      icon={Waves}
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={Waves}
          title="Nothing notable yet today"
          body="This fills in as heart rate readings come through. A steady day genuinely produces an empty timeline — that's a good sign, not missing data."
        />
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry, index) => {
            const spike = entry.direction === "spike";
            const color = spike ? toneColor("critical") : toneColor("positive");
            const Icon = spike ? TrendingUp : TrendingDown;
            return (
              <li key={entry.at} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `${color}1f`, color }}
                  >
                    <Icon size={13} aria-hidden="true" />
                  </span>
                  {index < entries.length - 1 && (
                    <span className="w-px flex-1" style={{ background: "var(--lux-hairline)" }} aria-hidden="true" />
                  )}
                </div>
                <div className={index < entries.length - 1 ? "pb-4" : ""}>
                  <p className="tabular text-[12px]" style={{ color: "var(--lux-muted)" }}>
                    {formatTime(entry.at)} · {entry.heartRate} bpm
                  </p>
                  <p className="mt-0.5 text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                    {entry.context ? (
                      <>
                        <span className="font-medium">{entry.context}</span>
                        {spike ? " — heart rate rose" : " — heart rate settled"}
                      </>
                    ) : spike ? (
                      "Heart rate rose"
                    ) : (
                      "Heart rate settled"
                    )}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
