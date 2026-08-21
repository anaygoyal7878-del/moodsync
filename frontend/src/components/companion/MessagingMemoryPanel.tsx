"use client";

import { useEffect, useState } from "react";
import { Brain, X, Loader2 } from "lucide-react";

/**
 * What MoodSync has remembered about you from texting — and a way to
 * make it forget.
 *
 * The delete button is the reason this screen exists. A memory the
 * subject can't inspect isn't a feature, it's a dossier; and because
 * facts are now ranked by reinforcement, a confidently wrong one is
 * *harder* to evict by attrition than a rarely-repeated true one. Being
 * able to see and remove them is what makes the memory legitimate.
 *
 * The reinforcement count is shown rather than hidden, because "MoodSync
 * has concluded this 4 separate times" explains why a fact keeps
 * shaping replies in a way a bare list never could.
 */

interface Fact {
  id: string;
  fact: string;
  reinforcedCount: number;
  lastReinforcedAt: string;
}

export function MessagingMemoryPanel() {
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  function load() {
    fetch("/api/messaging/memory", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ facts: Fact[]; cap: number }>) : null))
      .then((data) => {
        setFacts(data?.facts ?? []);
        setCap(data?.cap ?? null);
      })
      .catch(() => setFacts([]));
  }

  useEffect(load, []);

  function forget(id: string) {
    setRemoving(id);
    fetch(`/api/messaging/memory/${id}`, { method: "DELETE" })
      .then(() => setFacts((prev) => (prev ?? []).filter((f) => f.id !== id)))
      .catch(() => {})
      .finally(() => setRemoving(null));
  }

  return (
    <section className="glass-surface rounded-2xl p-5" style={{ background: "var(--lux-bg-card)" }}>
      <div className="flex items-center gap-2">
        <Brain size={16} aria-hidden style={{ color: "var(--lux-sage)" }} />
        <h2 className="text-sm font-medium" style={{ color: "var(--lux-ink)" }}>
          What it remembers about you
        </h2>
      </div>
      <p className="mb-3 mt-1 text-xs" style={{ color: "var(--lux-muted)" }}>
        Saved from your conversations when something seemed worth recalling later. Remove anything
        that’s wrong or that you’d rather it forgot.
      </p>

      {facts === null ? (
        <p className="text-sm" style={{ color: "var(--lux-muted)" }}>
          Loading…
        </p>
      ) : facts.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--lux-muted)" }}>
          Nothing remembered yet. MoodSync only saves something when it looks durable — a preference or
          a recurring pattern — not what you talked about today.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {facts.map((fact) => (
              <li
                key={fact.id}
                className="flex items-start gap-3 rounded-xl p-3"
                style={{ background: "var(--lux-bg-card-2)" }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm" style={{ color: "var(--lux-ink)" }}>
                    {fact.fact}
                  </span>
                  {fact.reinforcedCount > 1 && (
                    <span className="block text-xs" style={{ color: "var(--lux-muted)" }}>
                      Noticed {fact.reinforcedCount} separate times
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => forget(fact.id)}
                  aria-label={`Forget: ${fact.fact}`}
                  className="shrink-0 rounded-lg p-1"
                  style={{ color: "var(--lux-muted)" }}
                >
                  {removing === fact.id ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                  ) : (
                    <X size={16} aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
          {cap !== null && (
            <p className="mt-3 text-xs" style={{ color: "var(--lux-muted)" }}>
              {facts.length} of a maximum {cap}. Past that, the least-reinforced is dropped first.
            </p>
          )}
        </>
      )}
    </section>
  );
}
