"use client";

import { useEffect, useState } from "react";

/** Recharts' own entrance animations aren't gated by CSS the way
 * `fade-in-up` in globals.css is (`@media (prefers-reduced-motion:
 * no-preference)`), since they're driven by JS/SVG attribute
 * interpolation, not CSS keyframes. Chart components pass this to
 * `isAnimationActive` so reduced-motion users get the same respect the
 * rest of the app already gives them. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
