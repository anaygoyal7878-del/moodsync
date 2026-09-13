"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Trash2, Clock, Loader2 } from "lucide-react";
import type { PlannedWorkout, WorkoutKind } from "@/lib/types";

/**
 * Plan a workout, and mark it done.
 *
 * The form is deliberately two required fields — what and when — with
 * everything else optional. A planner that demands duration, time and
 * intensity before it will accept "legs on Thursday" is a planner people
 * stop opening, and an unentered workout produces no reminder at all,
 * which is the whole point of the feature.
 *
 * Time of day is optional for the same reason, and it is not a cosmetic
 * choice: leaving it blank means the reminder arrives with the morning's
 * plan, while setting it moves the reminder to ninety minutes before the
 * session. The helper text says so, because otherwise the field looks
 * like decoration.
 */

const KINDS: Array<{ value: WorkoutKind; label: string }> = [
  { value: "STRENGTH", label: "Strength" },
  { value: "CARDIO", label: "Cardio" },
  { value: "MOBILITY", label: "Mobility" },
  { value: "SPORT", label: "Sport" },
  { value: "REST", label: "Rest" },
];

/** "17:30" → 1050. Returns null for an empty or malformed value so the
 * request omits the field rather than sending a nonsense number. */
function timeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function WorkoutPlanner({ today, workouts }: { today: string; workouts: PlannedWorkout[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState(today);
  const [kind, setKind] = useState<WorkoutKind>("STRENGTH");
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [atTime, setAtTime] = useState("");
  const [notes, setNotes] = useState("");

  const { upcoming, past } = useMemo(() => {
    const up: PlannedWorkout[] = [];
    const done: PlannedWorkout[] = [];
    for (const w of workouts) (w.scheduledFor >= today ? up : done).push(w);
    // Past ascends in the API; newest-first reads better looking backwards.
    return { upcoming: up, past: done.reverse() };
  }, [workouts, today]);

  const create = useCallback(async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: date,
          kind,
          title: title.trim(),
          plannedMinutes: minutes ? Number(minutes) : null,
          plannedAtMinutes: timeToMinutes(atTime),
          notes: notes.trim() || null,
        }),
      });
      if (!response.ok) {
        setError("Couldn't save that one.");
        return;
      }
      setTitle("");
      setMinutes("");
      setAtTime("");
      setNotes("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }, [busy, date, kind, title, minutes, atTime, notes, router]);

  const complete = useCallback(
    async (id: string, detail: { actualMinutes: number | null; perceivedEffort: number | null }) => {
      if (busy) return;
      setBusy(true);
      try {
        // Both fields are sent, including nulls. The API accepts them and
        // an earlier version of this posted a bare `{}`, which silently
        // threw away the only outcome signal no wearable reports —
        // perceived effort. Nulls are a real answer ("done, didn't say"),
        // and the column stays nullable to hold exactly that.
        await fetch(`/api/workouts/${id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(detail),
        });
        router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
  );

  const remove = useCallback(
    async (id: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await fetch(`/api/workouts/${id}`, { method: "DELETE" });
        router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, router],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
          {upcoming.length === 0 ? "Nothing planned yet." : `${upcoming.length} coming up.`}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"
          style={{ background: "var(--lux-sage)", color: "#16211a" }}
        >
          <Plus size={14} aria-hidden="true" />
          Plan one
        </button>
      </div>

      {open && (
        <div
          className="flex flex-col gap-3 rounded-[18px] p-4"
          style={{ background: "var(--lux-bg-card-2)", border: "1px solid var(--lux-hairline)" }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
              What
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leg day, easy 5k, mobility…"
              aria-label="Workout name"
              className="rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none"
              style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className="rounded-full px-3 py-1.5 text-[12.5px]"
                style={
                  kind === k.value
                    ? { background: "var(--lux-sage)", color: "#16211a" }
                    : { background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }
                }
              >
                {k.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Day">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Day"
                className="w-full rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none"
                style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
              />
            </Field>
            <Field label="Minutes">
              <input
                type="number"
                min={1}
                max={600}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder="45"
                aria-label="Planned minutes"
                className="w-full rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none"
                style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
              />
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={atTime}
                onChange={(e) => setAtTime(e.target.value)}
                aria-label="Time of day"
                className="w-full rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none"
                style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
              />
            </Field>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
              Notes <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Working sets, route, what to focus on…"
              aria-label="Notes"
              rows={2}
              className="resize-y rounded-[12px] px-3 py-2.5 text-[13.5px] outline-none"
              style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
            />
          </label>

          {/* The time field changes when the reminder arrives, which is
              not guessable from a blank input. */}
          <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
            Leave the time blank and the reminder arrives with your morning plan. Set one and it arrives 90 minutes
            before — enough room to eat, change, or move it.
          </p>

          {error && (
            <p role="alert" className="text-[12.5px]" style={{ color: "var(--lux-rose)" }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy || title.trim().length === 0}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50"
              style={{ background: "var(--lux-sage)", color: "#16211a" }}
            >
              {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
              Save
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-[13px] font-medium"
              style={{ background: "var(--lux-bg-card)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <ul className="flex flex-col gap-2">
          {upcoming.map((w) => (
            <WorkoutRow key={w.id} workout={w} today={today} busy={busy} onComplete={complete} onRemove={remove} />
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
            Earlier ({past.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {past.map((w) => (
              <WorkoutRow key={w.id} workout={w} today={today} busy={busy} onComplete={complete} onRemove={remove} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * One workout row, with an inline "how did it go" step on completion.
 *
 * Completing opens a two-field panel rather than finishing immediately,
 * because perceived effort is the one outcome signal no wearable
 * reports — if it is not collected here it does not exist. But the panel
 * never blocks: "Just done" completes with both fields null, which is a
 * real answer and what the nullable columns are for. Demanding the
 * detail would cost the completion itself, and a workout marked done
 * with no detail is far more useful than one never marked at all.
 */
function WorkoutRow({
  workout,
  today,
  busy,
  onComplete,
  onRemove,
}: {
  workout: PlannedWorkout;
  today: string;
  busy: boolean;
  onComplete: (id: string, detail: { actualMinutes: number | null; perceivedEffort: number | null }) => void;
  onRemove: (id: string) => void;
}) {
  const [logging, setLogging] = useState(false);
  const [actual, setActual] = useState("");
  const [effort, setEffort] = useState<number | null>(null);

  const done = workout.completedAt !== null;
  const isToday = workout.scheduledFor === today;

  const meta = [
    isToday ? "Today" : workout.scheduledFor,
    workout.plannedAtMinutes !== null ? formatTime(workout.plannedAtMinutes) : null,
    workout.plannedMinutes ? `${workout.plannedMinutes} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // What actually happened, shown instead of the plan once it has. A
  // completed row that still reads "45 min" when the user logged 30 is
  // reporting the intention as though it were the outcome.
  const outcome = done
    ? [
        workout.actualMinutes ? `${workout.actualMinutes} min` : null,
        workout.perceivedEffort ? `effort ${workout.perceivedEffort}/5` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const submit = (detail: { actualMinutes: number | null; perceivedEffort: number | null }) => {
    setLogging(false);
    onComplete(workout.id, detail);
  };

  return (
    <li
      className="flex flex-col gap-2.5 rounded-[16px] px-3.5 py-3"
      style={{
        background: "var(--lux-bg-card-2)",
        border: `1px solid ${isToday && !done ? "var(--lux-hairline-gold)" : "var(--lux-hairline)"}`,
        opacity: done ? 0.7 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[13.5px] font-medium"
            style={{ color: "var(--lux-ink)", textDecoration: done ? "line-through" : undefined }}
          >
            {workout.title}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[12px]" style={{ color: "var(--lux-muted)" }}>
            {workout.plannedAtMinutes !== null && !done && <Clock size={11} aria-hidden="true" />}
            {done && outcome ? outcome : meta}
          </p>
          {workout.notes && (
            <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--lux-muted)" }}>
              {workout.notes}
            </p>
          )}
        </div>

        {!done && (
          <button
            type="button"
            onClick={() => setLogging((v) => !v)}
            disabled={busy}
            aria-label={`Mark ${workout.title} done`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
            style={{ background: "var(--lux-sage)", color: "#16211a" }}
          >
            <Check size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(workout.id)}
          disabled={busy}
          aria-label={`Delete ${workout.title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
          style={{ background: "var(--lux-bg-card)", color: "var(--lux-muted)", border: "1px solid var(--lux-hairline)" }}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </div>

      {logging && !done && (
        <div className="flex flex-col gap-2.5 rounded-[12px] p-3" style={{ background: "var(--lux-bg-card)" }}>
          <p className="text-[12px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
            How did it go?
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={600}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder={workout.plannedMinutes ? String(workout.plannedMinutes) : "min"}
              aria-label="Actual minutes"
              className="w-20 rounded-[10px] px-2.5 py-2 text-[13px] outline-none"
              style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
            />
            <span className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
              min
            </span>

            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setEffort(level)}
                  aria-label={`Effort ${level} of 5`}
                  aria-pressed={effort === level}
                  className="h-8 w-8 rounded-full text-[12.5px]"
                  style={
                    effort === level
                      ? { background: "var(--lux-sage)", color: "#16211a" }
                      : { background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }
                  }
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
            Effort is 1 (easy) to 5 (all out) — nothing you wear measures this, so it only exists if you say.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => submit({ actualMinutes: actual ? Number(actual) : null, perceivedEffort: effort })}
              disabled={busy}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-medium disabled:opacity-50"
              style={{ background: "var(--lux-sage)", color: "#16211a" }}
            >
              Log it
            </button>
            <button
              type="button"
              onClick={() => submit({ actualMinutes: null, perceivedEffort: null })}
              disabled={busy}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] disabled:opacity-50"
              style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }}
            >
              Just done
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
