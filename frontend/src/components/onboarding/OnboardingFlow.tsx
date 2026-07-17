"use client";

import { useState } from "react";
import { HeartPulse, Sparkles, ShieldCheck, ArrowRight, Watch } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface StepDef {
  key: string;
  render: (props: { onNext: () => void }) => React.ReactNode;
}

function GlowOrb({ className }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute h-72 w-72 rounded-full bg-brand/20 blur-3xl ${className ?? ""}`}
      aria-hidden="true"
    />
  );
}

function FeatureRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised">{icon}</div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-secondary">{body}</p>
      </div>
    </div>
  );
}

/** Connect-a-wearable step links straight into the real OAuth redirect
 * routes (same ones ConnectionsSection uses) rather than simulating a
 * connection — there is no mock/demo data path in this product. */
function ConnectRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
    >
      <span className="flex items-center gap-3">
        <Watch className="h-4 w-4 text-ink-secondary" aria-hidden="true" />
        {label}
      </span>
      <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />
    </a>
  );
}

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);

  const steps: StepDef[] = [
    {
      key: "welcome",
      render: ({ onNext }) => (
        <>
          <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
            <GlowOrb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-surface-raised border border-line-strong">
              <HeartPulse className="h-10 w-10 text-brand" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-center">Welcome to MoodSync</h1>
          <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-secondary">
            MoodSync reads signals from your wearable — heart rate, recovery, sleep — and automates your smart home
            in response, like dimming lights when your stress climbs or queuing a wind-down playlist before bed.
          </p>
          <Button variant="primary" className="mt-10 w-full max-w-xs" onClick={onNext}>
            Get started <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ),
    },
    {
      key: "how-it-works",
      render: ({ onNext }) => (
        <>
          <h2 className="text-2xl font-semibold tracking-tight text-center">Automations you can trust</h2>
          <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-secondary">
            Every rule is transparent about what triggered it, and every wellness score is honest about whether it
            came straight from your wearable or from a heuristic estimate.
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
            <FeatureRow
              icon={<Sparkles className="h-4 w-4 text-brand" aria-hidden="true" />}
              title="Rule-based automation"
              body="Build rules like “dim the lights when my stress score is elevated,” and see exactly which condition fired each time."
            />
            <FeatureRow
              icon={<ShieldCheck className="h-4 w-4 text-brand" aria-hidden="true" />}
              title="No overclaiming"
              body="Scores are labeled by source — a real wearable reading vs. an evidence-informed estimate — never presented as more certain than they are."
            />
          </div>
          <Button variant="primary" className="mt-10 w-full max-w-xs" onClick={onNext}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ),
    },
    {
      key: "connect",
      render: ({ onNext }) => (
        <>
          <div className="relative mb-8 flex h-32 w-32 items-center justify-center">
            <GlowOrb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-surface-raised border border-line-strong">
              <Watch className="h-8 w-8 text-brand" aria-hidden="true" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-center">Connect a wearable</h2>
          <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-secondary">
            Connect one now to start seeing real biometric data, or skip and connect later from your dashboard.
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
            <ConnectRow href="/api/integrations/whoop/connect" label="Connect WHOOP" />
            <ConnectRow href="/api/integrations/google-health/connect" label="Connect Fitbit" />
          </div>
          <Button variant="ghost" className="mt-6" onClick={onNext}>
            I&apos;ll do this later
          </Button>
        </>
      ),
    },
    {
      key: "done",
      render: ({ onNext }) => (
        <>
          <div className="relative mb-8 flex h-32 w-32 items-center justify-center">
            <GlowOrb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-surface-raised border border-line-strong">
              <Sparkles className="h-8 w-8 text-brand" aria-hidden="true" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-center">You&apos;re all set</h2>
          <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-secondary">
            Your dashboard is ready. Connect a smart home provider and build your first automation rule whenever
            you&apos;re ready.
          </p>
          <Button variant="primary" className="mt-10 w-full max-w-xs" onClick={onNext}>
            Go to dashboard <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ),
    },
  ];

  const isLastStep = stepIndex === steps.length - 1;
  const handleNext = () => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-6">
      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center py-16">
        <div key={steps[stepIndex].key} className="flex w-full flex-col items-center animate-fade-in-up">
          {steps[stepIndex].render({ onNext: handleNext })}
        </div>
      </div>

      <div className="mb-10 flex gap-1.5" role="tablist" aria-label="Onboarding progress">
        {steps.map((step, i) => (
          <span
            key={step.key}
            role="tab"
            aria-selected={i === stepIndex}
            className={`h-1.5 rounded-full transition-all ${i === stepIndex ? "w-6 bg-ink" : "w-1.5 bg-line-strong"}`}
          />
        ))}
      </div>
    </div>
  );
}
