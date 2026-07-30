import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { Music2, Sparkles, Clock, Timer, ListMusic, History } from "lucide-react";
import { PageHeader, Section, Stat, EmptyState, toneColor } from "@/components/companion/CompanionPrimitives";
import { EffectBar } from "@/components/companion/EffectBar";
import type { MusicAnalyticsResponse, MusicEffectivenessEntry, MusicSessionEntry } from "@/lib/types";

const MODE_LABEL: Record<string, string> = {
  FOCUS: "Focus",
  RELAX: "Relax",
  SLEEP: "Sleep prep",
  RECOVERY: "Recovery",
  MORNING: "Morning",
  WORKOUT: "Workout",
};

function hourRange(hour: number): string {
  const end = (hour + 2) % 24;
  return `${hour.toString().padStart(2, "0")}:00–${end.toString().padStart(2, "0")}:00`;
}

function maxMagnitudeOf(entries: MusicEffectivenessEntry[]): number {
  return entries.reduce((max, e) => Math.max(max, Math.abs(e.meanHeartRateDelta)), 0);
}

/** One row of the effectiveness chart — name, diverging bar, the number,
 * and the sample size that backs it. The sample size is never optional:
 * "helps you focus" over 3 sessions and over 40 are different claims. */
function EffectRow({ entry, maxMagnitude }: { entry: MusicEffectivenessEntry; maxMagnitude: number }) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13.5px] font-medium" style={{ color: "var(--lux-ink)" }}>
          {entry.label}
        </span>
        <span
          className="tabular shrink-0 text-[12.5px] font-semibold"
          style={{ color: entry.helped ? toneColor("positive") : toneColor("caution") }}
        >
          {entry.meanHeartRateDelta > 0 ? "+" : ""}
          {entry.meanHeartRateDelta} BPM
        </span>
      </div>
      <EffectBar delta={entry.meanHeartRateDelta} helped={entry.helped} maxMagnitude={maxMagnitude} />
      <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--lux-muted)" }}>
        <span>
          {MODE_LABEL[entry.mode] ?? entry.mode} · {entry.sessions} session{entry.sessions === 1 ? "" : "s"}
        </span>
        {entry.earlyStopRate > 0.5 && <span style={{ color: "var(--lux-rose)" }}>Often stopped early</span>}
      </div>
    </li>
  );
}

function SessionRow({ session }: { session: MusicSessionEntry }) {
  const delta = session.outcomeHeartRateDelta;
  const when = new Date(session.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13.5px]" style={{ color: "var(--lux-ink)" }}>
          {session.itemName}
        </p>
        <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
          {when} · {MODE_LABEL[session.mode] ?? session.mode}
          {session.genre ? ` · ${session.genre}` : ""}
        </p>
      </div>
      <span
        className="tabular shrink-0 text-[12.5px] font-medium"
        style={{ color: delta === null ? "var(--lux-muted)" : delta < 0 ? toneColor("positive") : toneColor("caution") }}
      >
        {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta} BPM`}
      </span>
    </li>
  );
}

/**
 * Music analytics — what MoodSync has learned about which music works
 * for this person.
 *
 * Everything here is built from stored session outcomes, and every
 * claim carries the number of sessions behind it. When there isn't
 * enough history the page says so rather than showing empty charts —
 * a chart with two points implies a trend that isn't there.
 */
export default async function MusicAnalyticsPage() {
  const [analyticsResult, sessionsResult] = await Promise.all([
    backendFetch<MusicAnalyticsResponse>("/api/music-analytics"),
    backendFetch<{ sessions: MusicSessionEntry[] }>("/api/music-sessions?limit=20"),
  ]);

  const analytics = analyticsResult.ok ? analyticsResult.data : null;
  const sessions = sessionsResult.ok ? sessionsResult.data.sessions : [];
  const hasFindings = (analytics?.playlists.length ?? 0) > 0 || (analytics?.genres.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="What music works for you"
        subtitle={
          analytics
            ? `From ${analytics.totalSessions} measured session${analytics.totalSessions === 1 ? "" : "s"} over the last ${analytics.windowDays} days.`
            : undefined
        }
      />

      {analytics && analytics.recommendations.length > 0 && (
        <div className="lux-stagger-2">
          <Section title="What to reach for" icon={Sparkles}>
            <ul className="flex flex-col gap-3">
              {analytics.recommendations.map((rec) => (
                <li key={rec.text} className="flex items-start gap-2.5">
                  <span
                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--lux-gold)" }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                      {rec.text}
                    </p>
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--lux-muted)" }}>
                      Based on {rec.sessions} session{rec.sessions === 1 ? "" : "s"}.
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {analytics?.focusDuration?.sentence && (
        <div className="lux-stagger-2">
          <Section title="Focus duration" icon={Timer}>
            <p className="text-[14px] leading-snug" style={{ color: "var(--lux-ink)" }}>
              {analytics.focusDuration.sentence}
            </p>
            <div className="mt-4 flex gap-10">
              <Stat label="With music" value={`${analytics.focusDuration.withMusicMinutes} min`} />
              <Stat label="Without" value={`${analytics.focusDuration.withoutMusicMinutes} min`} />
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
              An association between your focus sessions and what was playing — not evidence the music caused it.
            </p>
          </Section>
        </div>
      )}

      {hasFindings ? (
        <div className="lux-stagger-3 grid gap-4 lg:grid-cols-2">
          <Section title="By playlist" subtitle="Average heart rate change per session." icon={ListMusic}>
            <ul className="flex flex-col gap-4">
              {analytics!.playlists.slice(0, 6).map((entry) => (
                <EffectRow key={`${entry.mode}-${entry.label}`} entry={entry} maxMagnitude={maxMagnitudeOf(analytics!.playlists)} />
              ))}
            </ul>
          </Section>

          <Section title="By genre" subtitle="Grouped across playlists of the same kind." icon={Music2}>
            {analytics!.genres.length > 0 ? (
              <ul className="flex flex-col gap-4">
                {analytics!.genres.slice(0, 6).map((entry) => (
                  <EffectRow key={`${entry.mode}-${entry.label}`} entry={entry} maxMagnitude={maxMagnitudeOf(analytics!.genres)} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Music2}
                title="No genres matched yet"
                body="MoodSync reads a genre from the playlist's own name. Names like 'Lo-Fi Study' or 'Ambient Nights' get grouped; others stay uncategorised rather than guessed."
              />
            )}
          </Section>
        </div>
      ) : (
        <div className="lux-stagger-3">
          <Section title="Still learning" icon={Music2}>
            <EmptyState
              icon={Music2}
              title="Not enough sessions yet"
              body="MoodSync needs at least three measured sessions of the same playlist before it will tell you it works for you. Play something from the Music page and it starts learning."
              action={
                <Link
                  href="/dashboard/music"
                  className="rounded-full px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--lux-sage)", color: "#1a241e" }}
                >
                  Go to Music
                </Link>
              }
            />
          </Section>
        </div>
      )}

      {analytics && analytics.bestHours.some((group) => group.hours.length > 0) && (
        <div className="lux-stagger-4">
          <Section title="Best time of day" subtitle="When each mode has actually worked best." icon={Clock}>
            <div className="flex flex-col gap-4">
              {analytics.bestHours
                .filter((group) => group.hours.length > 0)
                .map((group) => (
                  <div key={group.mode}>
                    <p className="text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
                      {group.label}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {group.hours.slice(0, 4).map((hour) => (
                        <span
                          key={hour.hourOfDay}
                          className="rounded-full px-3 py-1.5 text-[12.5px]"
                          style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
                        >
                          <span className="tabular font-medium">{hourRange(hour.hourOfDay)}</span>
                          <span style={{ color: "var(--lux-muted)" }}>
                            {" "}
                            · {hour.meanHeartRateDelta > 0 ? "+" : ""}
                            {hour.meanHeartRateDelta} BPM
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </Section>
        </div>
      )}

      <div className="lux-stagger-5">
        <Section title="Session history" icon={History}>
          {sessions.length > 0 ? (
            <ul className="flex flex-col divide-y" style={{ borderColor: "var(--lux-hairline)" }}>
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={History} title="No sessions yet" body="Music sessions you start in MoodSync will appear here." />
          )}
        </Section>
      </div>
    </div>
  );
}
