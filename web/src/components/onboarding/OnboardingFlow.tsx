import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HeartPulse, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAppStore } from '../../store/useAppStore';

interface StepDef {
  key: string;
  render: (props: { onNext: () => void; connecting: boolean }) => React.ReactNode;
}

function GlowOrb({ className }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute h-72 w-72 rounded-full bg-brand/20 blur-3xl ${className ?? ''}`}
      aria-hidden="true"
    />
  );
}

const fadeVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const connectHealth = useAppStore((s) => s.connectHealth);
  const [connecting, setConnecting] = useState(false);
  // Mirrors stepIndex but updates synchronously, so rapid repeat clicks
  // (or a click landing mid-transition) can't read a stale "isLast" value
  // and push stepIndex past the end of the steps array.
  const stepIndexRef = useRef(0);

  const steps: StepDef[] = [
    {
      key: 'welcome',
      render: ({ onNext }) => (
        <>
          <div className="relative mb-8 flex h-40 w-40 items-center justify-center">
            <GlowOrb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-surface-raised border border-line-strong">
              <HeartPulse className="h-10 w-10 text-brand" aria-hidden="true" />
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-center">MoodSync</h1>
          <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-secondary">
            Your wellness companion, tuned to your body. MoodSync reads signals like heart rate and HRV
            and suggests an evidence-based scent for how you're actually doing right now.
          </p>
          <Button variant="primary" className="mt-10 w-full max-w-xs" onClick={onNext}>
            Get started <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ),
    },
    {
      key: 'how-it-works',
      render: ({ onNext }) => (
        <>
          <h2 className="text-2xl font-semibold tracking-tight text-center">Grounded in research, not vibes</h2>
          <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-secondary">
            Every recommendation is transparent about the evidence behind it — including when that evidence is thin.
          </p>
          <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
            <FeatureRow
              icon={<Sparkles className="h-4 w-4 text-state-focus" aria-hidden="true" />}
              title="Explainable by design"
              body="Every suggestion shows exactly which signals drove it, and a confidence level for the science behind it."
            />
            <FeatureRow
              icon={<ShieldCheck className="h-4 w-4 text-state-recover" aria-hidden="true" />}
              title="No overclaiming"
              body="We say “early research suggests” when that's what's true, not “studies show.”"
            />
          </div>
          <Button variant="primary" className="mt-10 w-full max-w-xs" onClick={onNext}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      ),
    },
    {
      key: 'connect',
      render: ({ onNext, connecting }) => (
        <>
          <div className="relative mb-8 flex h-32 w-32 items-center justify-center">
            <GlowOrb className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-state-focus/20" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-surface-raised border border-line-strong">
              <HeartPulse className="h-8 w-8 text-state-focus" aria-hidden="true" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-center">Connect Apple Health</h2>
          <p className="mt-3 max-w-sm text-center text-[15px] leading-relaxed text-ink-secondary">
            This prototype simulates a live Health feed so you can see MoodSync respond in real time. In
            production this step requests real HealthKit read access — heart rate, HRV, sleep, and
            mindfulness sessions — and nothing else.
          </p>
          <Button
            variant="primary"
            className="mt-10 w-full max-w-xs"
            disabled={connecting}
            onClick={async () => {
              await onNext();
            }}
          >
            {connecting ? 'Connecting…' : 'Simulate Health connection'}
          </Button>
          <p className="mt-3 text-xs text-ink-muted">No real health data leaves your device in this prototype.</p>
        </>
      ),
    },
  ];

  const handleNext = async () => {
    if (stepIndexRef.current >= steps.length - 1) {
      if (connecting) return;
      setConnecting(true);
      await connectHealth();
      setConnecting(false);
      onComplete();
      return;
    }
    stepIndexRef.current += 1;
    setStepIndex(stepIndexRef.current);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-canvas px-6">
      <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center py-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={steps[stepIndex].key}
            variants={fadeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.2, 0.6, 0.4, 1] }}
            className="flex w-full flex-col items-center"
          >
            {steps[stepIndex].render({ onNext: handleNext, connecting })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mb-10 flex gap-1.5" role="tablist" aria-label="Onboarding progress">
        {steps.map((step, i) => (
          <span
            key={step.key}
            role="tab"
            aria-selected={i === stepIndex}
            className={`h-1.5 rounded-full transition-all ${i === stepIndex ? 'w-6 bg-ink' : 'w-1.5 bg-line-strong'}`}
          />
        ))}
      </div>
    </div>
  );
}

function FeatureRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl2 border border-line bg-surface p-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised">{icon}</div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-secondary">{body}</p>
      </div>
    </div>
  );
}
