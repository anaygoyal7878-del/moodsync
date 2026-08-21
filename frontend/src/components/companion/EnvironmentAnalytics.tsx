import { TrendChart } from "@/components/ui/charts/TrendChart";
import { EffectBar } from "@/components/companion/EffectBar";

/**
 * Environment analytics — the charts behind the Adaptive Environment
 * loop.
 *
 * The design rule throughout: **a chart is a stronger claim than a
 * sentence.** A line implies a trend even when it's three points of
 * noise. So every panel here states its own sample size, sub-threshold
 * findings are shown greyed rather than presented as fact, and an
 * empty panel explains *why* it's empty instead of rendering an
 * ambiguous flat line.
 */

const STATE_LABELS: Record<string, string> = {
  focused: "Focused",
  stressed: "Elevated Stress",
  relaxed: "Relaxed",
  tired: "Tired",
  sleepy: "Sleepy",
  recovering: "Recovering",
  energized: "Energized",
  overstimulated: "Overstimulated",
  active: "Active",
  preparing_for_sleep: "Preparing for Sleep",
  unknown: "Still Learning",
};

function label(state: string): string {
  return STATE_LABELS[state] ?? state;
}

export interface AnalyticsData {
  totalSessions: number;
  stateFrequency: Array<{ state: string; count: number; share: number }>;
  acceptanceOverTime: Array<{ date: string; accepted: number; rejected: number; rate: number | null }>;
  outcomeByState: Array<{ state: string; meanDelta: number; sampleSize: number; reliable: boolean }>;
  overallAcceptanceRate: number | null;
  measuredOutcomes: number;
  appliedSessions: number;
}

export function EnvironmentAnalytics({ data }: { data: AnalyticsData }) {
  if (data.totalSessions === 0) {
    return (
      <Panel title="Nothing to chart yet">
        <p className="text-sm" style={{ color: "var(--lux-muted)" }}>
          MoodSync hasn’t proposed anything yet. Once it starts making suggestions and you respond to
          them, this page will show what it’s noticing and what actually helps.
        </p>
      </Panel>
    );
  }

  // Only days with a real rate become points. A day with nothing
  // offered is a gap, not a zero — plotting it as 0% would read as
  // "you rejected everything".
  const acceptancePoints = data.acceptanceOverTime
    .filter((p) => p.rate !== null)
    .map((p) => ({ date: p.date.slice(5), value: Math.round(p.rate! * 100) }));

  const maxMagnitude = Math.max(1, ...data.outcomeByState.map((o) => Math.abs(o.meanDelta)));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Proposals" value={String(data.totalSessions)} />
        <Stat
          label="Accepted"
          value={data.overallAcceptanceRate === null ? "—" : `${Math.round(data.overallAcceptanceRate * 100)}%`}
          hint={data.overallAcceptanceRate === null ? "Nothing answered yet" : undefined}
        />
        <Stat
          label="Measured"
          value={`${data.measuredOutcomes}/${data.appliedSessions}`}
          hint="Applied sessions with a usable before/after reading"
        />
      </div>

      <Panel title="What MoodSync sees" subtitle={`Across ${data.totalSessions} assessments`}>
        <ul className="space-y-2">
          {data.stateFrequency.map((entry) => (
            <li key={entry.state} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm" style={{ color: "var(--lux-ink)" }}>
                {label(entry.state)}
              </span>
              <span
                className="h-2 rounded-full"
                style={{
                  width: `${Math.max(2, entry.share * 100)}%`,
                  background: "var(--lux-sage)",
                  opacity: 0.75,
                }}
                aria-hidden
              />
              <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--lux-muted)" }}>
                {entry.count}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel
        title="Do you accept its suggestions?"
        subtitle="Days with no proposals are left out rather than drawn as zero"
      >
        {acceptancePoints.length < 2 ? (
          <p className="text-sm" style={{ color: "var(--lux-muted)" }}>
            {acceptancePoints.length === 0
              ? "No proposals have been answered yet."
              : "Only one day has data so far — not enough to draw a line."}
          </p>
        ) : (
          <TrendChart data={acceptancePoints} height={140} color="var(--lux-sage)" unit="%" />
        )}
      </Panel>

      <Panel
        title="What actually helps"
        subtitle="Average heart-rate change during each environment. Association, not proof."
      >
        {data.outcomeByState.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--lux-muted)" }}>
            {data.appliedSessions === 0
              ? "Nothing has been applied yet, so there’s nothing to measure."
              : "Environments have been applied, but no session had a usable before/after heart rate reading."}
          </p>
        ) : (
          <ul className="space-y-3">
            {data.outcomeByState.map((entry) => (
              <li key={entry.state} className="flex items-center gap-3" style={{ opacity: entry.reliable ? 1 : 0.5 }}>
                <span className="w-40 shrink-0 truncate text-sm" style={{ color: "var(--lux-ink)" }}>
                  {label(entry.state)}
                </span>
                <div className="min-w-0 flex-1">
                  <EffectBar delta={entry.meanDelta} helped={entry.meanDelta < 0} maxMagnitude={maxMagnitude} />
                </div>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--lux-muted)" }}>
                  {/* Sample size is never hidden — it's what separates a
                      finding from a coincidence. */}
                  {entry.sampleSize}×{entry.reliable ? "" : " · too few"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-surface rounded-2xl p-5" style={{ background: "var(--lux-bg-card)" }}>
      <h2 className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
        {title}
      </h2>
      {subtitle && (
        <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--lux-muted)" }}>
          {subtitle}
        </p>
      )}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Stat({ label: statLabel, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-surface rounded-xl p-4" style={{ background: "var(--lux-bg-card)" }}>
      <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--lux-muted)" }}>
        {statLabel}
      </p>
      <p className="mt-1 text-2xl font-medium tabular-nums" style={{ color: "var(--lux-ink)" }}>
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--lux-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
