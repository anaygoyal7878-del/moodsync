"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Section } from "./CompanionPrimitives";
import { EffectBar } from "./EffectBar";

/**
 * What MoodSync has actually learned about how this person's own
 * biometrics relate to how they say they feel — see
 * docs/AFFECT_MODEL_ARCHITECTURE.md.
 *
 * The four `learningStatus` situations render as four genuinely
 * different messages, not one grey "not enough data" placeholder,
 * because they call for different responses from the reader: keep
 * checking in, fix a sync problem, connect a wearable, or accept a real
 * negative result.
 */

interface AffectModel {
  target: "valence" | "arousal";
  sampleSize: number;
  usable: boolean;
  crossValidatedR2: number;
  associations: Array<{ feature: string; coefficient: number; correlation: number }>;
}

interface AffectSummary {
  totalCheckIns: number;
  usableSamples: number;
  status: string;
  valence: AffectModel;
  arousal: AffectModel;
  findings: string[];
}

const AXIS_LABEL: Record<string, string> = { valence: "Mood (pleasant/unpleasant)", arousal: "Energy (calm/activated)" };
const FEATURE_LABEL: Record<string, string> = {
  heartRate: "Heart rate",
  restingHeartRate: "Resting heart rate",
  heartRateVariability: "Heart rate variability",
  respiratoryRate: "Breathing rate",
  sleepScore: "Sleep quality",
  deepSleepMinutes: "Deep sleep",
  recoveryScore: "Recovery",
  activityLevel: "Activity level",
  steps: "Step count",
};

export function AffectInsights({ reloadKey = 0 }: { reloadKey?: number }) {
  const [data, setData] = useState<AffectSummary | null>(null);

  useEffect(() => {
    fetch("/api/affect/model", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<AffectSummary>) : null))
      .then(setData)
      .catch(() => setData(null));
  }, [reloadKey]);

  if (!data) return null;

  const models = [data.valence, data.arousal].filter((m) => m.sampleSize > 0);
  const maxMagnitude = Math.max(
    1,
    ...models.flatMap((m) => m.associations.map((a) => Math.abs(a.coefficient))),
  );

  return (
    <Section
      title="What your body says about your mood"
      subtitle={`${data.totalCheckIns} check-in${data.totalCheckIns === 1 ? "" : "s"} so far`}
      icon={Sparkles}
    >
      <p className="text-sm" style={{ color: "var(--lux-ink)" }}>
        {data.status}
      </p>

      {models.some((m) => m.usable) && (
        <div className="mt-4 space-y-4">
          {models
            .filter((m) => m.usable)
            .map((model) => (
              <div key={model.target}>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide" style={{ color: "var(--lux-muted)" }}>
                  {AXIS_LABEL[model.target]}
                </p>
                <ul className="space-y-2">
                  {model.associations.slice(0, 3).map((a) => (
                    <li key={a.feature} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 text-sm" style={{ color: "var(--lux-ink)" }}>
                        {FEATURE_LABEL[a.feature] ?? a.feature}
                      </span>
                      <div className="min-w-0 flex-1">
                        <EffectBar delta={a.coefficient} helped={a.coefficient >= 0} maxMagnitude={maxMagnitude} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          <p className="text-xs" style={{ color: "var(--lux-muted)" }}>
            Association, not cause — both directions are possible for every signal here. Never a
            diagnosis.
          </p>
        </div>
      )}
    </Section>
  );
}
