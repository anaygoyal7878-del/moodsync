"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArrowRight, X, Sparkles, Compass } from "lucide-react";
import { TOUR_STEPS, type TourStep } from "./tourSteps";

const STORAGE_KEY = "moodsync.tour.v1";

/** How long to keep looking for a step's anchor after routing to its
 * page before giving up and centring the card. Anchors appear when the
 * server component streams in, which is not synchronous with the
 * `usePathname` change. */
const ANCHOR_TIMEOUT_MS = 2500;

/** localStorage is read through useSyncExternalStore rather than an
 * effect, which keeps it out of the render path on the server (where
 * there is no storage) without a `mounted` flag and its extra render.
 * The subscribe is a no-op on purpose: nothing else in the app writes
 * this key mid-session — `finish` pairs its write with local state, and
 * `restartProductTour` does a full page load. */
const NEVER_CHANGES = () => () => {};

function readStored(): "done" | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "done" ? "done" : null;
  } catch {
    // Private-mode / storage-disabled: treat as unseen rather than
    // crashing the dashboard for the sake of a walkthrough.
    return null;
  }
}

function writeStored(value: "done" | null) {
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* no-op — see readStored */
  }
}

/** Exposed so a "Restart demo" control anywhere in the app can clear the
 * seen-flag and reload into the tour. */
export function restartProductTour() {
  writeStored(null);
  window.location.href = "/dashboard";
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function ProductTour() {
  const router = useRouter();
  const pathname = usePathname();

  const alreadySeen = useSyncExternalStore(
    NEVER_CHANGES,
    () => readStored() === "done",
    // Server snapshot: treat as seen so the tour renders nothing during
    // SSR. The client's first paint agrees, then storage decides.
    () => true,
  );
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);
  /** Keyed by step so a previous step's measurement can't be shown
   * against the next one while its anchor is still being located. */
  const [anchor, setAnchor] = useState<{ stepId: string; rect: Rect } | null>(null);
  const anchorDeadline = useRef<number>(0);

  const step: TourStep | undefined = TOUR_STEPS[index];
  const running = !alreadySeen && !dismissed;
  const rect = anchor && step && anchor.stepId === step.id ? anchor.rect : null;

  // Route to the step's page when it needs a different one. Done as an
  // effect (not in the click handler) so it also covers a tour resumed
  // mid-flow and the very first step.
  useEffect(() => {
    if (!running || !step?.href) return;
    if (pathname !== step.href) router.push(step.href);
  }, [running, step?.href, pathname, router]);

  // Find and track the anchor. Re-measured every frame so the spotlight
  // stays glued to the element it's describing through scrolls, resizes
  // and the page's own entrance animations. A step with no anchor needs
  // no work here at all — `rect` is derived from the step id above, so
  // an old measurement can't leak into it.
  useEffect(() => {
    if (!running || !step?.anchor) return;

    const stepId = step.id;
    anchorDeadline.current = Date.now() + ANCHOR_TIMEOUT_MS;
    let frame = 0;

    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
      if (!el) {
        // Anchor not rendered yet (route still streaming). Keep looking
        // until the deadline, then give up and leave the card centred.
        if (Date.now() < anchorDeadline.current) frame = requestAnimationFrame(measure);
        return;
      }
      const r = el.getBoundingClientRect();
      // Only commit when it actually moved. getBoundingClientRect returns
      // sub-pixel values that jitter while the page's own entrance
      // animations settle; re-rendering on every one of those pinned the
      // overlay in a permanent chase.
      setAnchor((prev) =>
        prev &&
        prev.stepId === stepId &&
        Math.abs(prev.rect.top - r.top) < 0.5 &&
        Math.abs(prev.rect.left - r.left) < 0.5 &&
        Math.abs(prev.rect.width - r.width) < 0.5 &&
        Math.abs(prev.rect.height - r.height) < 0.5
          ? prev
          : { stepId, rect: { top: r.top, left: r.left, width: r.width, height: r.height } },
      );
      frame = requestAnimationFrame(measure);
    };

    // Bring the anchor into view once, then track it.
    const scrollTarget = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    scrollTarget?.scrollIntoView({ block: "center", behavior: "smooth" });

    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [running, step?.anchor, step?.id, pathname]);

  const finish = useCallback(() => {
    writeStored("done");
    setDismissed(true);
  }, []);

  const next = useCallback(() => {
    if (index >= TOUR_STEPS.length - 1) finish();
    else setIndex((i) => i + 1);
  }, [index, finish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Keyboard: arrows to move, Escape to leave.
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, next, back, finish]);

  if (!running || !step) return null;

  const isLast = index === TOUR_STEPS.length - 1;
  const spotlit = rect !== null;
  const pad = 8;

  return createPortal(
    // `ms-luxury` is required, not decorative: it's the class that
    // defines the --lux-* custom properties (see globals.css). This
    // renders through a portal on document.body, outside the dashboard
    // subtree that normally carries it, so without it every
    // var(--lux-…) below resolves to nothing — which silently turns the
    // primary button transparent rather than erroring.
    //
    // The explicit `background: transparent` is the other half of that
    // trade: .ms-luxury also paints an opaque --lux-bg-ground, which on
    // a full-viewport overlay covers the very page the spotlight is
    // supposed to be cutting a hole through. We want its tokens, not
    // its backdrop.
    <div
      className="ms-luxury fixed inset-0 z-[9999]"
      style={{ background: "transparent" }}
      role="dialog"
      aria-modal="true"
      aria-label="Product walkthrough"
    >
      {/* Dimming. With an anchor this is a ring around the element (a
       * huge spread shadow with a transparent centre) so the real UI
       * stays visible and interactive-looking underneath; without one
       * it's a plain scrim behind a centred card. */}
      {spotlit ? (
        // `key` matters: without it React reuses this DOM node when
        // swapping from the full-screen scrim below, and the shared node
        // animates from inset-0 down to the spotlight rect. Distinct keys
        // force a fresh mount so the cut-out appears already in place.
        // Position deliberately isn't transitioned — the rAF loop above
        // already tracks the element, and a transition on top/left only
        // makes the overlay lag behind whatever it's describing.
        <div
          key="spotlight"
          className="ms-tour-spotlight pointer-events-none absolute"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            borderRadius: 20,
            boxShadow: "0 0 0 9999px rgba(8, 6, 10, 0.82)",
            outline: "1.5px solid rgba(95, 184, 120, 0.55)",
            outlineOffset: 2,
          }}
        />
      ) : (
        <div key="scrim" className="ms-tour-spotlight absolute inset-0" style={{ background: "rgba(8, 6, 10, 0.88)" }} />
      )}

      {/* Card. Bottom sheet when spotlighting (keeps the highlighted
       * element unobscured on a phone), centred for narrative beats. */}
      <div
        className={
          spotlit
            ? "absolute inset-x-0 bottom-0 flex justify-center p-4 pb-6"
            : "absolute inset-0 flex items-center justify-center p-6"
        }
      >
        <div
          key={step.id}
          className="ms-tour-card w-full max-w-[420px] rounded-3xl p-5"
          style={{
            background: "rgba(33, 27, 40, 0.92)",
            border: "1px solid var(--lux-hairline)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          }}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest"
              style={
                step.kind === "roadmap"
                  ? { background: "rgba(212,175,120,0.12)", border: "1px solid var(--lux-hairline-gold)", color: "var(--lux-gold)" }
                  : { background: "rgba(95,184,120,0.12)", border: "1px solid rgba(95,184,120,0.3)", color: "var(--lux-sage)" }
              }
            >
              {step.kind === "roadmap" ? <Compass size={11} aria-hidden="true" /> : <Sparkles size={11} aria-hidden="true" />}
              {step.kind === "roadmap" ? "Roadmap — not built yet" : `${index + 1} of ${TOUR_STEPS.length}`}
            </span>
            <button
              onClick={finish}
              className="-mr-1 -mt-1 rounded-full p-1.5 transition-opacity hover:opacity-70"
              style={{ color: "var(--lux-muted)" }}
              aria-label="Skip walkthrough"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <h2 className="font-luxury-display text-[20px] font-semibold leading-snug" style={{ color: "var(--lux-ink)" }}>
            {step.title}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--lux-ink)", opacity: 0.86 }}>
            {step.body}
          </p>
          {step.detail && (
            <p className="mt-2.5 text-[12px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
              {step.detail}
            </p>
          )}

          {/* Progress */}
          <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
            {TOUR_STEPS.map((s, i) => (
              <span
                key={s.id}
                className="h-[3px] flex-1 rounded-full transition-all duration-300"
                style={{ background: i <= index ? "var(--lux-sage)" : "rgba(255,255,255,0.12)" }}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {index > 0 && (
              <button
                onClick={back}
                className="rounded-full px-4 py-2.5 text-[13px] font-medium transition-opacity hover:opacity-80"
                style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
              >
                Back
              </button>
            )}
            <button
              onClick={finish}
              className="rounded-full px-3 py-2.5 text-[13px] transition-opacity hover:opacity-80"
              style={{ color: "var(--lux-muted)" }}
            >
              Skip
            </button>
            <button
              onClick={next}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-semibold transition-transform active:scale-[0.97]"
              style={{ background: "var(--lux-sage)", color: "#0f1a12" }}
            >
              {isLast ? "Finish" : "Continue"}
              {!isLast && <ArrowRight size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
