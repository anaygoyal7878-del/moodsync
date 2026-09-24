"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * When and how a chart animates in.
 *
 * ## Why charts wait until they are seen
 *
 * Every chart used to animate on mount, all at once, with Recharts'
 * default 1500ms. On the Home page that meant thirteen charts drawing
 * simultaneously — and every one below the fold finished its animation
 * before anyone scrolled to it. The motion was real and nobody saw it.
 *
 * So a chart now mounts when it scrolls near the viewport, and animates
 * then. The side effect is a performance win rather than a cost: charts
 * nobody reaches are never laid out or drawn at all.
 *
 * `rootMargin` starts the reveal slightly before the chart enters the
 * screen, so it is already drawing as it arrives rather than popping in
 * visibly late.
 *
 * ## The shared timing
 *
 * 750ms with an ease-out curve, replacing 1500ms linear-ish defaults.
 * Half the duration because a chart is information, not a show — it
 * should arrive fast and settle, and ease-out puts most of the motion at
 * the start so the line is readable almost immediately.
 *
 * Reduced motion disables animation outright, and also skips the
 * deferred mount: someone who has asked for less motion should not get a
 * chart appearing late as a substitute for animating.
 */

export const CHART_ANIMATION = {
  animationDuration: 750,
  animationEasing: "ease-out" as const,
};

export function useChartMotion(): {
  ref: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  animate: boolean;
} {
  const reducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen || reducedMotion) return;
    const node = ref.current;
    // No IntersectionObserver (very old browsers, some test envs): show
    // immediately rather than never.
    if (!node || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px 120px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen, reducedMotion]);

  return { ref, visible: seen || reducedMotion, animate: !reducedMotion };
}
