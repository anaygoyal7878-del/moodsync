"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { motion, MotionConfig } from "motion/react";
import { NAV_INDICATOR_SPRING } from "@/lib/motion";

const TABS = [
  { href: "/dashboard/music", label: "Home", exact: true },
  { href: "/dashboard/music/search", label: "Search", exact: false },
  { href: "/dashboard/music/library", label: "Library", exact: false },
] as const;

export function MusicNav() {
  const pathname = usePathname();

  return (
    <MotionConfig reducedMotion="user">
      <nav className="flex items-center gap-1 border-b border-line pb-2">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "relative isolate rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "text-ink"
                  : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
              )}
            >
              {/* The pill slides between tabs rather than jumping. */}
              {active && (
                <motion.span
                  layoutId="music-nav-active"
                  transition={NAV_INDICATOR_SPRING}
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-full bg-brand"
                />
              )}
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </MotionConfig>
  );
}
