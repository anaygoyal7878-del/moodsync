"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { RecommendationEntry } from "@/lib/types";

/** Maps a recommendation's `templateId` to the human-readable name shown
 * in RuleForm.tsx's own template picker — kept in sync manually rather
 * than importing from a client component, since this list only needs
 * the display name, not the full template definition. */
const TEMPLATE_NAMES: Record<string, string> = {
  "elevated-stress": "Elevated Stress",
  recovery: "Recovery",
};

function RecommendationCard({ recommendation, onResponded }: { recommendation: RecommendationEntry; onResponded: () => void }) {
  const [submitting, setSubmitting] = useState<"accept" | "dismiss" | null>(null);

  async function respond(action: "accept" | "dismiss") {
    setSubmitting(action);
    await fetch(`/api/recommendations/${recommendation.id}/${action}`, { method: "POST" });
    setSubmitting(null);
    onResponded();
  }

  const templateName = TEMPLATE_NAMES[recommendation.suggestedActions.templateId] ?? recommendation.suggestedActions.templateId;

  return (
    <Card>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">{recommendation.title}</p>
        <p className="text-sm text-ink-secondary">{recommendation.description}</p>
        <p className="text-xs text-ink-muted">
          To use it: open &ldquo;New rule&rdquo; below and pick the &ldquo;{templateName}&rdquo; template — this only
          suggests it, MoodSync never creates a rule without you confirming which device it controls.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={submitting !== null} onClick={() => respond("accept")}>
            {submitting === "accept" ? "Accepting…" : "Got it, I'll set this up"}
          </Button>
          <Button variant="ghost" disabled={submitting !== null} onClick={() => respond("dismiss")}>
            {submitting === "dismiss" ? "Dismissing…" : "Dismiss"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function RecommendationsSection({ recommendations }: { recommendations: RecommendationEntry[] }) {
  const router = useRouter();

  if (recommendations.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Suggested for you</h2>
      <div className="flex flex-col gap-2">
        {recommendations.map((r) => (
          <RecommendationCard key={r.id} recommendation={r} onResponded={() => router.refresh()} />
        ))}
      </div>
    </section>
  );
}
