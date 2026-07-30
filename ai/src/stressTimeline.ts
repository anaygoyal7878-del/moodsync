export interface HeartRateSample {
  timestamp: Date;
  heartRate: number;
}

export interface TimelineContextEvent {
  /** Calendar event title, workout name — whatever the caller can name
   * honestly. Never invented: a shift with no matching context event
   * gets `context: null` rather than a guessed cause. */
  label: string;
  start: Date;
  end: Date;
}

export type StressShiftDirection = 'spike' | 'drop';

export interface StressTimelineEntry {
  at: Date;
  direction: StressShiftDirection;
  /** How far this window's mean heart rate sat from the day's mean, in
   * the day's own standard deviations. */
  magnitudeZ: number;
  heartRate: number;
  /** The context event overlapping this moment, if one exists. `null` is
   * a real, common answer — most physiological shifts have no calendar
   * entry to explain them, and this app says so rather than inventing a
   * cause. */
  context: string | null;
}

/** Window the samples get bucketed into before comparison — narrow
 * enough to localize a shift to roughly "when," wide enough that a
 * single noisy sample can't produce an entry. */
const BUCKET_MINUTES = 15;
const MIN_SAMPLES_PER_BUCKET = 2;
/** How far a bucket has to sit from the day's mean to count as a real
 * shift. MoodSync's own threshold. */
const SHIFT_Z_THRESHOLD = 1;
const MIN_BUCKETS_FOR_TIMELINE = 4;

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

function findContext(at: Date, events: TimelineContextEvent[]): string | null {
  const overlapping = events.find((e) => at >= e.start && at <= e.end);
  return overlapping?.label ?? null;
}

/**
 * Stress Timeline — instead of one average stress number for the day,
 * this surfaces the specific *moments* heart rate moved meaningfully
 * against the day's own baseline, and names the calendar event or
 * workout overlapping each one where there is one.
 *
 * Deliberately built on raw heart rate rather than the computed stress
 * score: `computeStressScore` needs HRV plus 5+ days of history and
 * resolves to one value per reading, which can't produce a
 * within-the-day timeline. Heart rate is the only signal in this app
 * dense enough to say "at 11:42 AM something changed."
 *
 * Returns an empty array — not a fabricated flat line — when there
 * aren't enough samples across enough buckets to compare anything.
 */
export function computeStressTimeline(
  samples: HeartRateSample[],
  contextEvents: TimelineContextEvent[] = [],
): StressTimelineEntry[] {
  if (samples.length === 0) return [];

  const buckets = new Map<number, HeartRateSample[]>();
  for (const sample of samples) {
    const key = Math.floor(sample.timestamp.getTime() / (BUCKET_MINUTES * 60_000));
    const existing = buckets.get(key) ?? [];
    existing.push(sample);
    buckets.set(key, existing);
  }

  const usable = [...buckets.entries()]
    .filter(([, bucketSamples]) => bucketSamples.length >= MIN_SAMPLES_PER_BUCKET)
    .map(([key, bucketSamples]) => ({
      key,
      at: new Date(Math.min(...bucketSamples.map((s) => s.timestamp.getTime()))),
      heartRate: mean(bucketSamples.map((s) => s.heartRate)),
    }))
    .sort((a, b) => a.key - b.key);

  if (usable.length < MIN_BUCKETS_FOR_TIMELINE) return [];

  const dayValues = usable.map((b) => b.heartRate);
  const dayMean = mean(dayValues);
  const daySd = stdev(dayValues, dayMean);
  if (daySd === 0) return [];

  return usable
    .map((bucket) => {
      const z = (bucket.heartRate - dayMean) / daySd;
      if (Math.abs(z) < SHIFT_Z_THRESHOLD) return null;
      return {
        at: bucket.at,
        direction: (z > 0 ? 'spike' : 'drop') as StressShiftDirection,
        magnitudeZ: Number(z.toFixed(2)),
        heartRate: Math.round(bucket.heartRate),
        context: findContext(bucket.at, contextEvents),
      };
    })
    .filter((entry): entry is StressTimelineEntry => entry !== null);
}

/** One-line phrasing for a timeline entry, matching the product's
 * "11:42 AM Meeting → Stress spiked" framing. Kept next to the
 * computation so the wording can't drift between surfaces. */
export function describeTimelineEntry(entry: StressTimelineEntry): string {
  const movement = entry.direction === 'spike' ? 'Heart rate rose' : 'Heart rate settled';
  return entry.context ? `${entry.context} — ${movement.toLowerCase()}` : movement;
}
