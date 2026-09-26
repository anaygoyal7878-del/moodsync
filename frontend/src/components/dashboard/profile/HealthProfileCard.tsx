"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Pencil, Scale, Trash2, Loader2 } from "lucide-react";
import type { HealthProfileResponse } from "@/lib/types";

/**
 * Your body, as MoodSync understands it.
 *
 * Two halves on one surface: what you told it (birth date, height,
 * weight) and what it worked out (age, heart-rate zones, BMI, weight
 * trend). They sit together because the second only exists because of
 * the first — and showing the derivation right next to its inputs is
 * what makes it checkable rather than something to take on faith.
 *
 * Everything is stored metric and converted here for display. The units
 * toggle changes presentation only, so switching back and forth can
 * never round a stored value away.
 *
 * Every derived number says how certain it is. The max-heart-rate figure
 * in particular is a population regression with roughly ±11 bpm of
 * individual scatter, and it says so, and says when a real measured peak
 * has replaced it.
 */

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

const BMI_LABEL: Record<string, string> = {
  underweight: "Underweight",
  healthy: "Healthy weight",
  overweight: "Overweight",
  obesity: "Obesity",
};

function fmtWeight(kg: number, units: "imperial" | "metric"): string {
  return units === "metric" ? `${kg.toFixed(1)} kg` : `${Math.round(kg / KG_PER_LB)} lb`;
}

function fmtHeight(cm: number, units: "imperial" | "metric"): string {
  if (units === "metric") return `${Math.round(cm)} cm`;
  const totalIn = Math.round(cm / CM_PER_IN);
  return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`;
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function HealthProfileCard() {
  const [data, setData] = useState<HealthProfileResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [birthDate, setBirthDate] = useState("");
  const [heightA, setHeightA] = useState(""); // cm, or feet
  const [heightB, setHeightB] = useState(""); // inches (imperial only)
  const [weight, setWeight] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/health-profile");
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as HealthProfileResponse);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  // Initial load inline, with a cancellation guard, so a fast unmount
  // can never write state into a component that is gone. `load` is kept
  // for the refresh after a save.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health-profile")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: HealthProfileResponse) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const units = data?.units ?? "imperial";

  const startEditing = () => {
    if (!data) return;
    setBirthDate(data.profile.birthDate ?? "");
    const cm = data.profile.heightCm;
    if (cm === null) {
      setHeightA("");
      setHeightB("");
    } else if (units === "metric") {
      setHeightA(String(Math.round(cm)));
      setHeightB("");
    } else {
      const totalIn = Math.round(cm / CM_PER_IN);
      setHeightA(String(Math.floor(totalIn / 12)));
      setHeightB(String(totalIn % 12));
    }
    setWeight("");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let heightCm: number | null = null;
      if (heightA.trim()) {
        heightCm =
          units === "metric"
            ? Number(heightA)
            : (Number(heightA) * 12 + (Number(heightB) || 0)) * CM_PER_IN;
        if (!Number.isFinite(heightCm) || heightCm < 90 || heightCm > 250) {
          setError("That height doesn't look right — check the units.");
          return;
        }
      }

      const profileResponse = await fetch("/api/health-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: birthDate || null,
          heightCm: heightCm === null ? null : Math.round(heightCm * 10) / 10,
        }),
      });
      if (!profileResponse.ok) {
        const body = (await profileResponse.json().catch(() => null)) as { error?: string } | null;
        setError(typeof body?.error === "string" ? body.error : "Couldn't save that.");
        return;
      }

      // Weight is logged as a new entry rather than overwriting the last
      // one, so the history is what makes the trend possible.
      if (weight.trim()) {
        const kg = units === "metric" ? Number(weight) : Number(weight) * KG_PER_LB;
        if (!Number.isFinite(kg) || kg < 20 || kg > 350) {
          setError("That weight doesn't look right — check the units.");
          return;
        }
        await fetch("/api/health-profile/weights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weightKg: Math.round(kg * 10) / 10 }),
        });
      }

      setEditing(false);
      await load();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const setUnits = async (next: "imperial" | "metric") => {
    if (!data || next === units) return;
    setData({ ...data, units: next });
    await fetch("/api/health-profile/units", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ units: next }),
    });
  };

  const eraseAll = async () => {
    if (!window.confirm("Delete your birth date, height and weight history? Your account stays.")) return;
    setBusy(true);
    await fetch("/api/health-profile", { method: "DELETE" });
    setBusy(false);
    setEditing(false);
    await load();
  };

  const inputStyle = {
    background: "var(--lux-bg-card-2)",
    color: "var(--lux-ink)",
    border: "1px solid var(--lux-hairline)",
  };

  return (
    <section
      className="relative overflow-hidden rounded-[24px] p-5"
      style={{ background: "var(--grad-hero)", border: "1px solid var(--lux-hairline-gold)", boxShadow: "var(--elev-1)" }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "var(--grad-gold-glow)" }} />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--gold)" }}>
            Health profile
          </p>
          <h2 className="font-luxury-display mt-1 text-[18px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            Your body, as MoodSync reads it
          </h2>
        </div>

        <div className="flex shrink-0 rounded-full p-0.5" style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}>
          {(["imperial", "metric"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => void setUnits(u)}
              aria-pressed={units === u}
              className="rounded-full px-2.5 py-1 text-[11.5px] transition-colors duration-200"
              style={units === u ? { background: "var(--lux-bg-card-2)", color: "var(--gold)" } : { color: "var(--lux-muted)" }}
            >
              {u === "imperial" ? "lb / ft" : "kg / cm"}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <p role="alert" className="relative mt-4 text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
          Your health profile couldn&apos;t be loaded right now.
        </p>
      )}

      {!loadError && data === null && (
        <div className="relative mt-4 grid grid-cols-3 gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[58px] animate-pulse rounded-[14px]" style={{ background: "var(--lux-bg-card-2)" }} />
          ))}
        </div>
      )}

      {data && !editing && (
        <div className="relative mt-4 flex flex-col gap-4">
          {/* What you told MoodSync. */}
          <div className="grid grid-cols-3" style={{}}>
            {[
              { label: "Age", value: data.derived.age !== null ? String(data.derived.age) : "—", sub: data.profile.birthDate ? fmtDate(data.profile.birthDate) : "Add birthday" },
              { label: "Height", value: data.profile.heightCm !== null ? fmtHeight(data.profile.heightCm, units) : "—", sub: data.profile.heightCm !== null ? "" : "Add height" },
              {
                label: "Weight",
                value: data.derived.weightTrend ? fmtWeight(data.derived.weightTrend.latestKg, units) : "—",
                sub:
                  data.derived.weightTrend?.changeKg != null
                    ? `${data.derived.weightTrend.changeKg > 0 ? "+" : ""}${units === "metric" ? `${data.derived.weightTrend.changeKg} kg` : `${Math.round(data.derived.weightTrend.changeKg / KG_PER_LB)} lb`} over ${data.derived.weightTrend.spanDays}d`
                    : data.derived.weightTrend
                      ? "Log again in a week for a trend"
                      : "Add weight",
              },
            ].map((item, i) => (
              <div key={item.label} className={i === 0 ? "" : "pl-4"} style={i === 0 ? undefined : { borderLeft: "1px solid var(--lux-hairline)" }}>
                <p className="font-luxury-display tabular text-[24px] font-semibold leading-none" style={{ color: "var(--lux-ink)" }}>
                  {item.value}
                </p>
                <p className="mt-1.5 text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--lux-muted)" }}>
                  {item.label}
                </p>
                {item.sub && (
                  <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--lux-muted)" }}>
                    {item.sub}
                  </p>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={startEditing}
            className="flex items-center justify-center gap-1.5 self-start rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-opacity active:opacity-70"
            style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline-gold)" }}
          >
            <Pencil size={12} aria-hidden="true" />
            Update
          </button>

          {/* What MoodSync worked out. */}
          {(data.derived.maxHeartRate || data.derived.bmi) && (
            <div className="flex flex-col gap-3 rounded-[18px] p-4" style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}>
              {data.derived.maxHeartRate && (
                <div>
                  <div className="flex items-center gap-1.5">
                    <Activity size={13} style={{ color: "var(--viz-heart)" }} aria-hidden="true" />
                    <p className="text-[12.5px] font-medium" style={{ color: "var(--lux-ink)" }}>
                      Max heart rate{" "}
                      <span className="tabular" style={{ color: "var(--gold)" }}>
                        {data.derived.maxHeartRate.bpm} bpm
                      </span>
                    </p>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                    {data.derived.maxHeartRate.basis === "measured"
                      ? "Measured — your own device has recorded this, which beats any age estimate."
                      : `Estimated from your age. Real maximums vary by about ±11 bpm (${data.derived.maxHeartRate.range!.low}–${data.derived.maxHeartRate.range!.high}), so treat the zones below as a starting point.`}
                  </p>

                  {data.derived.zones && (
                    <ul className="mt-2.5 flex flex-col gap-1">
                      {data.derived.zones.map((z) => (
                        <li key={z.zone} className="flex items-baseline gap-2 text-[12px]">
                          <span className="w-4 tabular" style={{ color: z.zone >= 4 ? "var(--gold)" : "var(--lux-muted)" }}>
                            {z.zone}
                          </span>
                          <span className="w-[74px]" style={{ color: "var(--lux-ink)" }}>
                            {z.label}
                          </span>
                          <span className="w-[74px] tabular" style={{ color: "var(--lux-muted)" }}>
                            {z.minBpm}–{z.maxBpm}
                          </span>
                          <span className="hidden min-w-0 truncate sm:inline" style={{ color: "var(--lux-muted)" }}>
                            {z.feel}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {data.derived.bmi && (
                <div style={data.derived.maxHeartRate ? { borderTop: "1px solid var(--lux-hairline)", paddingTop: 12 } : undefined}>
                  <div className="flex items-center gap-1.5">
                    <Scale size={13} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
                    <p className="text-[12.5px] font-medium" style={{ color: "var(--lux-ink)" }}>
                      BMI <span className="tabular">{data.derived.bmi.value}</span>
                      {data.derived.bmi.category && (
                        <span style={{ color: "var(--lux-muted)" }}> · {BMI_LABEL[data.derived.bmi.category]}</span>
                      )}
                    </p>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                    {data.derived.bmi.note}
                  </p>
                </div>
              )}
            </div>
          )}

          {data.derived.age === null && (
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
              Adding your birthday unlocks heart-rate zones and the right sleep target for your age — MoodSync uses the
              adult range until then.
            </p>
          )}

          {data.evidence.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
                Where these numbers come from
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {data.evidence.map((source) => (
                  <li key={source.id} className="text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2" style={{ color: "var(--lux-sage)" }}>
                      {source.title}
                    </a>{" "}
                    — {source.organization}. {source.supports}
                    {source.limits && <span style={{ opacity: 0.85 }}> Does not establish: {source.limits}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {data && editing && (
        <div className="relative mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--lux-muted)" }}>
              Birthday
            </span>
            <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} aria-label="Birthday" className="rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none" style={inputStyle} />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--lux-muted)" }}>
              Height
            </span>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="decimal" value={heightA} onChange={(e) => setHeightA(e.target.value)} placeholder={units === "metric" ? "178" : "5"} aria-label={units === "metric" ? "Height in centimetres" : "Height, feet"} className="w-24 rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none" style={inputStyle} />
              <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
                {units === "metric" ? "cm" : "ft"}
              </span>
              {units === "imperial" && (
                <>
                  <input type="number" inputMode="numeric" value={heightB} onChange={(e) => setHeightB(e.target.value)} placeholder="10" aria-label="Height, inches" className="w-20 rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none" style={inputStyle} />
                  <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
                    in
                  </span>
                </>
              )}
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--lux-muted)" }}>
              Weight today <span className="normal-case tracking-normal">(optional — adds to your history)</span>
            </span>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={units === "metric" ? "72" : "160"} aria-label="Weight" className="w-28 rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none" style={inputStyle} />
              <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
                {units === "metric" ? "kg" : "lb"}
              </span>
            </div>
          </label>

          {error && (
            <p role="alert" className="text-[12.5px]" style={{ color: "var(--lux-rose)" }}>
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={busy} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50" style={{ background: "var(--gold)", color: "#1a1408" }}>
              {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-full px-4 py-2 text-[13px]" style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}>
              Cancel
            </button>
            <button type="button" onClick={() => void eraseAll()} disabled={busy} className="ml-auto flex items-center gap-1 text-[12px] disabled:opacity-50" style={{ color: "var(--lux-muted)" }}>
              <Trash2 size={12} aria-hidden="true" />
              Delete health data
            </button>
          </div>

          <p className="text-[11px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
            Stored only on your account, used only to personalise your readings. MoodSync doesn&apos;t ask for sex because
            nothing it calculates needs it.
          </p>
        </div>
      )}
    </section>
  );
}
