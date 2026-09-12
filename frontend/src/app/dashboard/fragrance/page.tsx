import Link from "next/link";
import { backendFetch } from "@/lib/api";
import { CalendarClock, Sparkles, Droplet, Clock, Info } from "lucide-react";
import { PageHeader, Section, EmptyState } from "@/components/companion/CompanionPrimitives";
import type { ScentBriefing } from "@/lib/types";

/**
 * Fragrance — what to wear, and when to put it on.
 *
 * Ordered by how a person actually uses it: what's ahead (the calendar
 * read that drives the choice), then the choice, then how to apply it,
 * then the rest of the collection. The calendar leads because it is the
 * reasoning — someone who disagrees with the occasion will disagree with
 * everything below it, and they should be able to see why before they
 * read the recommendation rather than after.
 *
 * Two honesty boundaries are load-bearing here and neither is cosmetic:
 *
 *  - **A missing note pyramid is shown as missing.** Nature's Note
 *    publishes Solaris's pyramid and not the other two. Rendering an
 *    empty note list would read as "this fragrance has no notes"; this
 *    page says the brand doesn't list them and shows the description
 *    instead. Inventing "probably oud and leather" for a real product a
 *    real business sells would be fabricating a spec sheet.
 *  - **An occasion guessed from timing is labelled as a guess.** Apple
 *    Calendar shares no event titles by design, so an occasion inferred
 *    from a block's shape is genuinely less certain than one read from
 *    "Dinner with Mara". The badge says which, so the two never read
 *    with equal confidence.
 */
export default async function FragrancePage() {
  const result = await backendFetch<ScentBriefing>("/api/scent");
  const briefing = result.ok ? result.data : null;

  if (!briefing) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Fragrance" subtitle="What to wear, and when to put it on." />
        <EmptyState icon={Sparkles} title="Couldn't load your fragrance briefing" body="Try again in a moment." />
      </div>
    );
  }

  if (!briefing.enabled) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Fragrance" subtitle="What to wear, and when to put it on." />
        <EmptyState
          icon={Sparkles}
          title="Fragrance suggestions are turned off"
          body="Turn the scent channel back on under Settings to see a recommendation here."
        />
      </div>
    );
  }

  const { recommendation: rec, calendar, collection, guidance } = briefing;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Fragrance" subtitle="What to wear, and when to put it on." />

      {/* The reasoning, before the conclusion it produced. */}
      <div className="lux-stagger-1">
        <Section title="What's ahead" subtitle="Read from your calendar." icon={CalendarClock}>
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-3 py-1 text-[12.5px] font-medium"
                style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
              >
                {calendar.occasionLabel}
              </span>
              <OccasionBadge basis={calendar.basis} />
            </div>

            <p className="text-[13px] leading-snug" style={{ color: "var(--lux-muted)" }}>
              {calendar.reason}
            </p>

            {!calendar.connected && (
              <Link
                href="/dashboard/connections"
                className="text-[12.5px] underline underline-offset-2"
                style={{ color: "var(--lux-sage)" }}
              >
                Connect a calendar to make this specific to your day
              </Link>
            )}

            {calendar.applicationTiming && (
              <div
                className="mt-1 flex items-start gap-2.5 rounded-[16px] p-3.5"
                style={{ background: "var(--lux-bg-card-2)", border: "1px solid var(--lux-hairline)" }}
              >
                <Clock size={15} style={{ color: "var(--lux-gold)" }} aria-hidden="true" className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium" style={{ color: "var(--lux-ink)" }}>
                    {calendar.applicationTiming.headline}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                    {calendar.applicationTiming.detail}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>

      {rec && (
        <>
          <div className="lux-stagger-2">
            <Section title="Wear this" subtitle={rec.tagline} icon={Sparkles}>
              <div className="flex flex-col gap-3">
                <p className="font-luxury-display text-[22px] font-semibold leading-tight" style={{ color: "var(--lux-ink)" }}>
                  {rec.name}
                </p>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                  {rec.description}
                </p>

                <ul className="mt-1 flex flex-col gap-1.5">
                  {rec.reasons.map((reason) => (
                    <li key={reason} className="text-[13px] leading-snug" style={{ color: "var(--lux-ink)" }}>
                      · {reason}
                    </li>
                  ))}
                </ul>

                <NotePyramid notes={rec.notes} published={rec.notesPublished} />

                {rec.alternatives.length > 0 && (
                  <p className="mt-1 text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
                    Also in the collection: {rec.alternatives.map((a) => a.name).join(", ")}.
                  </p>
                )}
              </div>
            </Section>
          </div>

          <div className="lux-stagger-3">
            <Section title="Where to put it" subtitle="Two points, not more." icon={Droplet}>
              <ul className="flex flex-col gap-2.5">
                {rec.pulsePoints.map((point) => (
                  <li key={point.where} className="flex items-start gap-2.5">
                    <Droplet size={14} style={{ color: "var(--lux-sage)" }} aria-hidden="true" className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium" style={{ color: "var(--lux-ink)" }}>
                        {point.where}
                      </p>
                      <p className="text-[12.5px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                        {point.note}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-3.5 text-[12.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                {rec.noteTiming}
              </p>

              <ul className="mt-2.5 flex flex-col gap-1">
                {guidance.rules.map((rule) => (
                  <li key={rule} className="text-[12px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                    · {rule}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </>
      )}

      <div className="lux-stagger-4">
        <Section title="The collection" subtitle="Nature's Note." icon={Sparkles}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {collection.map((scent) => (
              <div
                key={scent.name}
                className="flex flex-col gap-1.5 rounded-[18px] p-3.5"
                style={{
                  background: "var(--lux-bg-card-2)",
                  border: `1px solid ${scent.name === rec?.name ? "var(--lux-hairline-gold)" : "var(--lux-hairline)"}`,
                }}
              >
                <p className="text-[14px] font-semibold" style={{ color: "var(--lux-ink)" }}>
                  {scent.name}
                </p>
                <p className="text-[11.5px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-gold)" }}>
                  {scent.tagline}
                </p>
                <p className="text-[12.5px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                  {scent.description}
                </p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/** Says how the occasion was determined. A title read off a real event
 * and a shape inferred from a time block are not equally certain, and a
 * single unlabelled "Date night" would present them as though they
 * were. */
function OccasionBadge({ basis }: { basis: ScentBriefing["calendar"]["basis"] }) {
  const copy: Record<typeof basis, string | null> = {
    title: "from your event",
    structure: "inferred from timing",
    none: null,
  };
  const label = copy[basis];
  if (!label) return null;

  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11.5px]"
      style={{
        background: "transparent",
        color: basis === "title" ? "var(--lux-sage)" : "var(--lux-muted)",
        border: `1px solid ${basis === "title" ? "var(--lux-sage)" : "var(--lux-hairline)"}`,
      }}
    >
      {label}
    </span>
  );
}

/** The top/heart/base breakdown, or an honest note that the brand
 * doesn't publish one. Never an empty list — see the page header. */
function NotePyramid({
  notes,
  published,
}: {
  notes: ScentBriefing["collection"][number]["notes"];
  published: boolean;
}) {
  if (!published || !notes) {
    return (
      <div
        className="mt-1 flex items-start gap-2.5 rounded-[16px] p-3.5"
        style={{ background: "var(--lux-bg-card-2)", border: "1px solid var(--lux-hairline)" }}
      >
        <Info size={14} style={{ color: "var(--lux-muted)" }} aria-hidden="true" className="mt-0.5 shrink-0" />
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
          Nature&apos;s Note doesn&apos;t publish a note breakdown for this one, so MoodSync doesn&apos;t guess at it.
        </p>
      </div>
    );
  }

  const bands: Array<{ label: string; when: string; items: string[] }> = [
    { label: "Top", when: "first 30 min", items: notes.top },
    { label: "Heart", when: "30 min – 4 hrs", items: notes.heart },
    { label: "Base", when: "4+ hrs", items: notes.base },
  ];

  return (
    <div className="mt-1 flex flex-col gap-2">
      {bands.map((band) => (
        <div key={band.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[11.5px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-gold)" }}>
            {band.label}
          </span>
          <span className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
            {band.when}
          </span>
          <span className="text-[13px]" style={{ color: "var(--lux-ink)" }}>
            {band.items.join(", ")}
          </span>
        </div>
      ))}
    </div>
  );
}
