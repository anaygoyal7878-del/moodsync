import { backendFetch } from "@/lib/api";
import { Brain, Clock, Lightbulb } from "lucide-react";
import { WeeklyReportSection } from "@/components/dashboard/WeeklyReportSection";
import { Section, EmptyState, toneColor } from "@/components/companion/CompanionPrimitives";
import type { PersistedInsight, WellnessMemoryResponse } from "@/lib/types";

function hourLabel(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

/**
 * Weekly Intelligence.
 *
 * The existing week-over-week metric report answers "what improved and
 * what got worse." The two sections added below answer the two harder
 * questions: what patterns MoodSync actually detected in *this* person's
 * behaviour, and what that implies for next week.
 *
 * Both come from Wellness Memory (`GET /api/wellness-memory`), which
 * only reports a pattern once it has seen the same kind of thing at
 * least three times with measurements either side. When it hasn't, this
 * page says it's still learning rather than inventing a takeaway — a
 * weekly report that manufactures an insight every week is worth
 * nothing by week three.
 */
export default async function WeeklyReportPage() {
  const [weeklyInsightsResult, memoryResult] = await Promise.all([
    backendFetch<{ insights: PersistedInsight[] }>("/api/insights/history?period=WEEKLY&limit=50"),
    backendFetch<WellnessMemoryResponse>("/api/wellness-memory"),
  ]);

  const weeklyInsights = weeklyInsightsResult.ok ? weeklyInsightsResult.data.insights : [];
  const memory = memoryResult.ok ? memoryResult.data : null;

  const helping = memory?.findings.filter((f) => f.meanDelta > 0) ?? [];
  const hurting = memory?.findings.filter((f) => f.meanDelta < 0) ?? [];
  const bestHour = memory?.bestFocusHours[0];

  return (
    <div className="flex flex-col gap-5">
      <WeeklyReportSection insights={weeklyInsights} />

      <Section
        title="Patterns MoodSync noticed"
        subtitle={memory ? `Across the last ${memory.windowDays} days of your own history.` : undefined}
        icon={Brain}
      >
        {memory && (memory.findings.length > 0 || bestHour) ? (
          <div className="flex flex-col gap-4">
            {memory.findings.slice(0, 5).map((finding) => {
              const good = finding.meanDelta > 0;
              const color = good ? toneColor("positive") : toneColor("critical");
              return (
                <div key={finding.label} className="flex items-start gap-3">
                  <span
                    className="tabular mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{ background: `${color}1f`, color }}
                  >
                    {good ? "+" : ""}
                    {finding.meanDelta}
                  </span>
                  <p className="text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                    {finding.sentence}
                  </p>
                </div>
              );
            })}

            {bestHour && (
              <div className="flex items-start gap-3 border-t pt-4" style={{ borderColor: "var(--lux-hairline)" }}>
                <span
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-sage)" }}
                >
                  <Clock size={13} aria-hidden="true" />
                </span>
                <p className="text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                  You focus best around <span className="font-medium">{hourLabel(bestHour.hourOfDay)}</span> — an average
                  focus score of {bestHour.meanScore} across {bestHour.sampleSize} session
                  {bestHour.sampleSize === 1 ? "" : "s"}.
                </p>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Brain}
            title="Still learning your patterns"
            body="MoodSync needs to see the same kind of session at least three times, with recovery readings either side, before it will tell you it found a pattern."
          />
        )}
      </Section>

      <Section title="What to change next week" icon={Lightbulb}>
        {helping.length === 0 && hurting.length === 0 && !bestHour ? (
          <EmptyState
            icon={Lightbulb}
            title="No recommendation yet"
            body="This turns into specific advice once there's enough of your own history behind it. Until then there's nothing here worth saying."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {helping[0] && (
              <li className="text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                <span className="font-medium">Do more of: {helping[0].label}.</span> It&apos;s the thing with the clearest
                positive effect on your recovery so far.
              </li>
            )}
            {hurting[0] && (
              <li className="text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                <span className="font-medium">Watch: {hurting[0].label}.</span> Your recovery has tended to come out lower
                afterwards — worth paying attention to rather than acting on immediately.
              </li>
            )}
            {bestHour && (
              <li className="text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                <span className="font-medium">Protect {hourLabel(bestHour.hourOfDay)}.</span> Put next week&apos;s hardest
                work there rather than whatever lands in the calendar first.
              </li>
            )}
          </ul>
        )}
      </Section>
    </div>
  );
}
