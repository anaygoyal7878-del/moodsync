"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Fades and slides its children in the first time they scroll into
 * view — stays visible afterward (the observer disconnects on first
 * intersection rather than toggling back out on scroll-away), matching
 * how a one-time section reveal reads rather than a distracting
 * fade-out-and-back-in on every scroll direction change. */
export function FadeInSection({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // `typeof IntersectionObserver === "undefined"` is also true during
  // SSR (no such global in Node) — checking `typeof window` first keeps
  // the server-rendered (and pre-hydration client) output at
  // visible=false, so only a REAL old-browser client without
  // IntersectionObserver support falls back to always-visible. Getting
  // this wrong previously meant the server always rendered opacity:1,
  // shipping the section already fully visible with no fade.
  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: "opacity 1s ease-out, transform 1s ease-out",
      }}
    >
      {children}
    </div>
  );
}
